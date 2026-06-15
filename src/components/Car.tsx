import { useRef, useEffect } from 'react'
import { Mesh, Vector3 as ThreeVector3 } from 'three'
import { RigidBody, useRapier, CuboidCollider } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useInputStore } from '../store/inputStore'
import { useGameStore } from '../store/gameStore'
import { useTelemetryStore } from '../store/telemetryStore'
import { setVisualEffectsData } from '../store/visualEffectsStore'
import { updateDriftPhysics } from '../physics/DriftPhysics'
import { getDriftAssistParams, applyAssists } from '../physics/AssistsManager'
import { createDriftDetectionSystem } from '../physics/DriftDetectionSystem'
import { magnitude, quatRotate } from '../physics/vecMath'
import type { RapierRigidBody } from '@react-three/rapier'
import type { DriftState } from '../physics/DriftDetectionSystem'

const BODY_WIDTH = 1.2
const BODY_HEIGHT = 0.4
const BODY_LENGTH = 2.4
const WHEEL_RADIUS = 0.3
const WHEEL_HEIGHT = 0.2
const AXLE_OFFSET = 0.8

const ENGINE_FORCE = 800
const MAX_BRAKE_FORCE = 100
const HANDBRAKE_FORCE = 300
const MAX_STEER = 0.5

interface WheelConfig {
  connection: [number, number, number]
  isLeft: boolean
  isFront: boolean
}

const WHEEL_CONFIGS: WheelConfig[] = [
  { connection: [-BODY_WIDTH / 2 - 0.1, -BODY_HEIGHT / 2, AXLE_OFFSET],  isLeft: true,  isFront: true },
  { connection: [BODY_WIDTH / 2 + 0.1,  -BODY_HEIGHT / 2, AXLE_OFFSET],  isLeft: false, isFront: true },
  { connection: [-BODY_WIDTH / 2 - 0.1, -BODY_HEIGHT / 2, -AXLE_OFFSET], isLeft: true,  isFront: false },
  { connection: [BODY_WIDTH / 2 + 0.1,  -BODY_HEIGHT / 2, -AXLE_OFFSET], isLeft: false, isFront: false },
]

function createRapierVector(rapier: any, x: number, y: number, z: number) {
  return new rapier.Vector3(x, y, z)
}

interface CarProps {
  chassisRef: React.RefObject<RapierRigidBody | null>
}

const DEFAULT_DRIFT_STATE: DriftState = {
  isDrifting: false,
  driftAngle: 0,
  yawRate: 0,
  driftDuration: 0,
  driftScore: 0,
}

export default function Car({ chassisRef }: CarProps) {
  const wheelRefs = useRef<(Mesh | null)[]>([null, null, null, null])
  const controllerRef = useRef<any>(null)
  const currentSteer = useRef(0)
  const driftDetectionRef = useRef(createDriftDetectionSystem())
  const driftStateRef = useRef<DriftState>(DEFAULT_DRIFT_STATE)
  const lastDriftScoreRef = useRef(0)
  const { world, rapier } = useRapier()

  // Create the vehicle controller once the chassis rigid body is ready
  useEffect(() => {
    const body = chassisRef.current
    if (!body || !world || !rapier) return

    const rawWorld = (world as any).raw || world
    const rawBody = (body as any).raw || body

    const controller = rawWorld.createVehicleController(rawBody, {
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })

    // Add wheels
    const suspensionDirection = createRapierVector(rapier, 0, -1, 0)

    for (let i = 0; i < 4; i++) {
      const cfg = WHEEL_CONFIGS[i]
      const connection = createRapierVector(rapier, cfg.connection[0], cfg.connection[1], cfg.connection[2])
      const axleDir = createRapierVector(rapier, -1, 0, 0)

      controller.addWheel(connection, suspensionDirection, axleDir, 0.4, WHEEL_RADIUS)

      // Configure suspension
      controller.setWheelSuspensionStiffness(i, 50)
      controller.setWheelSuspensionCompression(i, 8)
      controller.setWheelSuspensionRelaxation(i, 10)
      controller.setWheelMaxSuspensionTravel(i, 0.5)
      controller.setWheelMaxSuspensionForce(i, 10000)
      controller.setWheelFrictionSlip(i, 1.0)
      controller.setWheelSideFrictionStiffness(i, 1.0)
    }

    controllerRef.current = controller as any

    return () => {
      controller.free()
      controllerRef.current = null
    }
  }, [world, rapier, chassisRef])

  useFrame((_state, delta) => {
    const controller = controllerRef.current
    if (!controller) return

    const input = useInputStore.getState()
    const chassis = chassisRef.current
    const mode = useGameStore.getState().mode

    // Engine force - rear wheels (2, 3)
    let engineForce = 0
    if (input.forward) engineForce = ENGINE_FORCE
    else if (input.backward) engineForce = -ENGINE_FORCE * 0.6

    // --- Compute raw steering from input ---
    let rawTargetSteer = 0
    if (input.left) rawTargetSteer = MAX_STEER
    else if (input.right) rawTargetSteer = -MAX_STEER

    // --- DRIFT PHYSICS (runs before controller.updateVehicle) ---
    if (chassis) {
      // Get chassis velocity and rotation from Rapier
      const linvel = chassis.linvel()
      const angvel = chassis.angvel()
      const rotation = chassis.rotation()

      // Get assist params for the current mode
      const assistParams = getDriftAssistParams(mode)

      // Apply driving assists (counter-steer during drift)
      const driftState = driftStateRef.current
      const { adjustedSteer } = applyAssists(rawTargetSteer, driftState, assistParams)

      // Clamp adjusted steer
      const clampedSteer = Math.max(-MAX_STEER, Math.min(MAX_STEER, adjustedSteer))

      // Run drift physics — modulates per-wheel friction slip based on Pacejka
      const driftResult = updateDriftPhysics({
        vehicleController: controller,
        chassis,
        chassisRotation: rotation,
        chassisLinvel: linvel,
        chassisAngvel: angvel,
        input: {
          steerInput: clampedSteer / MAX_STEER,
          throttleInput: input.forward ? 1 : input.backward ? -0.6 : 0,
          brakeInput: 0,
          handbrake: input.handbrake,
        },
        mode,
        dt: delta,
        wheelConfigs: WHEEL_CONFIGS,
        effectiveMu: assistParams.effectiveMu,
        handbrakeForceMultiplier: assistParams.handbrakeForceMultiplier,
        engineForce,
      })

      // Update drift detection system with rear wheel slip data
      const rearSlipAngles = [
        driftResult.wheelData[2].slipAngleRad,
        driftResult.wheelData[3].slipAngleRad,
      ]
      const newDriftState = driftDetectionRef.current.update(rearSlipAngles, angvel, delta)
      driftStateRef.current = newDriftState

      // Accumulate drift score to game store (only add the delta)
      const scoreDelta = newDriftState.driftScore - lastDriftScoreRef.current
      if (scoreDelta > 0) {
        useGameStore.getState().addDriftScore(scoreDelta)
      }
      lastDriftScoreRef.current = newDriftState.driftScore

      // --- Compute telemetry (speed, RPM, gear, slip angle) ---
      const speedMs = magnitude(linvel)
      const speedKmh = speedMs * 3.6

      // RPM from rear wheel longitudinal velocity
      const rearLongVel = (
        driftResult.wheelData[2].longitudinalVelocity +
        driftResult.wheelData[3].longitudinalVelocity
      ) / 2
      const wheelAngVel = Math.abs(rearLongVel) / WHEEL_RADIUS
      let rpm = wheelAngVel / (2 * Math.PI) * 60
      rpm = Math.max(800, Math.min(7000, rpm))

      // Gear from speed / RPM ratio
      let gear: string
      if (engineForce < 0 && speedMs < -0.5) {
        gear = 'R'
      } else if (speedKmh < 0.5 && rpm < 1000) {
        gear = 'N'
      } else {
        const ratio = speedKmh / (rpm + 1) * 1000
        if (ratio < 5) gear = '1'
        else if (ratio < 12) gear = '2'
        else if (ratio < 22) gear = '3'
        else if (ratio < 35) gear = '4'
        else if (ratio < 50) gear = '5'
        else gear = '6'
      }

      const slipAngleDeg = driftStateRef.current.driftAngle * (180 / Math.PI)

      useTelemetryStore.getState().publish({
        speedKmh,
        rpm,
        gear,
        slipAngleDeg,
        isDrifting: driftStateRef.current.isDrifting,
      })

      // --- Publish wheel data for visual effects (smoke, skid marks) ---
      const t = chassis.translation()
      const r = chassis.rotation()
      const tVec = { x: t.x, y: t.y, z: t.z }
      const qVec = { x: r.x, y: r.y, z: r.z, w: r.w }
      const wheelVisuals = driftResult.wheelData.map((wd, idx) => {
        const cfg = WHEEL_CONFIGS[idx]
        // Compute world position of wheel contact point
        const localOffset = { x: cfg.connection[0], y: cfg.connection[1], z: cfg.connection[2] }
        const worldOffset = quatRotate(qVec, localOffset)
        const worldPos = new ThreeVector3(
          tVec.x + worldOffset.x,
          tVec.y + worldOffset.y,
          tVec.z + worldOffset.z,
        )
        const isSlipping = !wd.isGripping
        return {
          worldPosition: worldPos,
          isSlipping,
          slipIntensity: isSlipping ? Math.min(1, Math.abs(wd.slipAngleRad) / 0.5) : 0,
          longitudinalVelocity: wd.longitudinalVelocity,
        }
      })
      setVisualEffectsData({
        wheels: wheelVisuals,
        isDrifting: newDriftState.isDrifting,
        speedKmh,
      })

      // Use the adjusted steer for the rest of the frame
      rawTargetSteer = clampedSteer
    }

    // Steering - smooth interpolation toward target (possibly adjusted by assists)
    currentSteer.current += (rawTargetSteer - currentSteer.current) * Math.min(1, 10 * delta)

    // Apply steering to front wheels (0, 1)
    controller.setWheelSteering(0, currentSteer.current)
    controller.setWheelSteering(1, currentSteer.current)

    // Apply engine force to rear wheels (2, 3)
    controller.setWheelEngineForce(2, engineForce)
    controller.setWheelEngineForce(3, engineForce)

    // Brakes
    const handbrake = input.handbrake

    // Front brakes
    if (engineForce === 0 && !handbrake) {
      controller.setWheelBrake(0, MAX_BRAKE_FORCE)
      controller.setWheelBrake(1, MAX_BRAKE_FORCE)
    } else {
      controller.setWheelBrake(0, 0)
      controller.setWheelBrake(1, 0)
    }

    // Rear brakes - handbrake engages rear only
    if (handbrake) {
      controller.setWheelBrake(2, HANDBRAKE_FORCE)
      controller.setWheelBrake(3, HANDBRAKE_FORCE)
    } else if (engineForce === 0) {
      controller.setWheelBrake(2, MAX_BRAKE_FORCE)
      controller.setWheelBrake(3, MAX_BRAKE_FORCE)
    } else {
      controller.setWheelBrake(2, 0)
      controller.setWheelBrake(3, 0)
    }

    // Update vehicle physics
    controller.updateVehicle(delta)

    // Sync visual wheels - positioned in chassis-local space
    for (let i = 0; i < 4; i++) {
      const group = wheelRefs.current[i] as any
      if (!group) continue

      const cfg = WHEEL_CONFIGS[i]
      const suspLength = controller.wheelSuspensionLength(i)
      const wheelRot = controller.wheelRotation(i)
      const steering = controller.wheelSteering(i) ?? 0

      if (suspLength === null || wheelRot === null) continue

      // Local position = connection point + suspension along local -Y
      // The wheel center is WHEEL_RADIUS above the ground contact point
      group.position.set(cfg.connection[0], cfg.connection[1] - suspLength + WHEEL_RADIUS, cfg.connection[2])

      // X-axis rolls forward/backward, Y-axis steers left/right for front wheels
      const roll = -wheelRot * (cfg.isLeft ? -1 : 1)  // negated for Rapier's convention
      const steer = cfg.isFront ? steering : 0

      group.rotation.set(roll, steer, 0)
    }
  })

  return (
    <group position={[0, 0, 0]}>
      {/* Chassis rigid body - elevated safely to allow suspension initialization */}
      <RigidBody
        ref={chassisRef}
        type="dynamic"
        colliders={false}
        mass={150}
        position={[0, 1.0, -18]}
        enabledRotations={[true, true, true]}
      >
        <CuboidCollider
          args={[BODY_WIDTH / 2, BODY_HEIGHT / 2, BODY_LENGTH / 2]}
          restitution={0.0}
          friction={0.5}
        />

        {/* Body mesh */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH]} />
          <meshStandardMaterial color="#e53935" />
        </mesh>

        {/* Cabin / roof */}
        <mesh position={[0, BODY_HEIGHT / 2 + 0.15, -0.15]} castShadow>
          <boxGeometry args={[BODY_WIDTH * 0.8, 0.25, BODY_LENGTH * 0.5]} />
          <meshStandardMaterial color="#212121" />
        </mesh>

        {/* Visual wheels - children of RigidBody, move with chassis */}
        {WHEEL_CONFIGS.map((cfg, idx) => (
          <group
            key={idx}
            ref={(el) => { wheelRefs.current[idx] = el as any }}
            position={cfg.connection}
          >
            {/* Inner mesh handles the structural 90-degree flip to lay the cylinder flat on the axle */}
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_HEIGHT, 24]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
          </group>
        ))}
      </RigidBody>
    </group>
  )
}
