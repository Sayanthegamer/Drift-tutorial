import { useRef, useEffect } from 'react'
import { Mesh } from 'three'
import { RigidBody, useRapier, CuboidCollider } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useInputStore } from '../store/inputStore'
import { useGameStore } from '../store/gameStore'
import { updateDriftPhysics } from '../physics/DriftPhysics'
import { getDriftAssistParams, applyAssists } from '../physics/AssistsManager'
import { createDriftDetectionSystem } from '../physics/DriftDetectionSystem'
import type { RapierRigidBody } from '@react-three/rapier'
import type { DriftState } from '../physics/DriftDetectionSystem'

const BODY_WIDTH = 1.2
const BODY_HEIGHT = 0.4
const BODY_LENGTH = 2.4
const WHEEL_RADIUS = 0.3
const WHEEL_HEIGHT = 0.2
const AXLE_OFFSET = 0.8

const ENGINE_FORCE = 800
const MAX_BRAKE_FORCE = 30
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

    // Pass the configuration object directly into the initialization function
    const controller = rawWorld.createVehicleController(rawBody, {
      indexUpAxis: 1,
      indexForwardAxis: 2
    })

    // Add wheels
    const suspensionDirection = createRapierVector(rapier, 0, -1, 0)

    for (let i = 0; i < 4; i++) {
      const cfg = WHEEL_CONFIGS[i]
      const connection = createRapierVector(rapier, cfg.connection[0], cfg.connection[1], cfg.connection[2])
      const axleDir = createRapierVector(rapier, cfg.isLeft ? -1 : 1, 0, 0)

      controller.addWheel(connection, suspensionDirection, axleDir, 0.4, WHEEL_RADIUS)

      // Configure suspension
      controller.setWheelSuspensionStiffness(i, 30)
      controller.setWheelSuspensionCompression(i, 4)
      controller.setWheelSuspensionRelaxation(i, 5)
      controller.setWheelMaxSuspensionTravel(i, 0.3)
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
      const mesh = wheelRefs.current[i]
      if (!mesh) continue

      const cfg = WHEEL_CONFIGS[i]
      const suspLength = controller.wheelSuspensionLength(i)
      const wheelRot = controller.wheelRotation(i)

      if (suspLength === null || wheelRot === null) continue

      // Local position = connection point + suspension along local -Y
      mesh.position.set(cfg.connection[0], cfg.connection[1] - suspLength, cfg.connection[2])

      // Apply wheel rotation around the axle
      mesh.rotation.set(wheelRot * (cfg.isLeft ? -1 : 1), 0, 0)
    }
  })

  return (
    <group position={[0, 1.5, 0]}>
      {/* Chassis rigid body */}
      <RigidBody
        ref={chassisRef}
        type="dynamic"
        colliders={false}
        mass={150}
        position={[0, BODY_HEIGHT / 2, 0]}
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
          <mesh
            key={idx}
            ref={(el) => { wheelRefs.current[idx] = el }}
            position={cfg.connection}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_HEIGHT, 24]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
      </RigidBody>
    </group>
  )
}
