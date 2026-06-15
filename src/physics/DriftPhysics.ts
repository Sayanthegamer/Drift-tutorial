import { computeLateralForce, DEFAULT_PACEJKA_COEFFS } from './TireModel'
import { VEHICLE_CONFIG } from './VehicleConfig'
import type { Vec3, Quat } from './vecMath'
import {
  cross,
  dot,
  magnitude,
  normalize,
  scale,
  add,
  quatRotate,
  rotateAroundAxis,
} from './vecMath'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end
}

/**
 * Extract the wheel's local forward direction in world space.
 * Front wheels are affected by steering; rear wheels are not.
 */
function getWheelForward(
  rotation: Quat,
  steeringAngle: number,
  isFront: boolean,
): Vec3 {
  // Chassis-local forward is (0, 0, -1) — Three.js convention (-Z forward)
  const localForward: Vec3 = { x: 0, y: 0, z: -1 }
  const worldForward = quatRotate(rotation, localForward)

  if (!isFront || Math.abs(steeringAngle) < 0.001) {
    return worldForward
  }

  // Rotate forward around the chassis up axis by the steering angle
  const localUp: Vec3 = { x: 0, y: 1, z: 0 }
  const worldUp = quatRotate(rotation, localUp)
  return rotateAroundAxis(worldForward, worldUp, steeringAngle)
}

/**
 * Get the wheel's lateral (axle) direction in world space.
 * The axle is along the chassis-local X axis, with sign determined by isLeft.
 */
function getWheelRight(rotation: Quat, _isLeft: boolean): Vec3 {
  const localRight: Vec3 = { x: -1, y: 0, z: 0 }
  return quatRotate(rotation, localRight)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WheelConfig {
  connection: [number, number, number]
  isLeft: boolean
  isFront: boolean
}

export interface WheelDriftData {
  index: number
  slipAngleRad: number
  lateralForce: number
  longitudinalVelocity: number
  lateralVelocity: number
  isGripping: boolean
  effectiveFrictionSlip: number
}

export interface DriftPhysicsArgs {
  /** The DynamicRayCastVehicleController from Rapier */
  vehicleController: any
  /** The chassis RigidBody (RapierRigidBody from @react-three/rapier) */
  chassis: any
  /** Chassis rotation quaternion (used for coordinate transforms) */
  chassisRotation: Quat
  /** Chassis linear velocity (world space) */
  chassisLinvel: Vec3
  /** Chassis angular velocity (world space) */
  chassisAngvel: Vec3
  /** Input state */
  input: {
    steerInput: number  // -1 to 1
    throttleInput: number  // 0 to 1
    brakeInput: number  // 0 to 1
    handbrake: boolean
  }
  /** Driving mode */
  mode: 'rookie' | 'advanced'
  /** Time delta (seconds) */
  dt: number
  /** Wheel configurations (connection point in chassis-local coords) */
  wheelConfigs: WheelConfig[]
  /** Effective mu from assists */
  effectiveMu: number
  /** Handbrake force multiplier from assists */
  handbrakeForceMultiplier: number
  /** Current engine force applied to the rear wheels */
  engineForce: number
  /** Previous effective slip values per wheel */
  prevEffectiveSlip: number[]
  /** Previous side friction stiffness values per wheel */
  prevSideFrictionStiffness: number[]
}

export interface DriftPhysicsResult {
  wheelData: WheelDriftData[]
  appliedHandbrakeImpulse: boolean
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function updateDriftPhysics(args: DriftPhysicsArgs): DriftPhysicsResult {
  const {
    vehicleController,
    chassis,
    chassisRotation,
    chassisLinvel,
    chassisAngvel,
    input,
    dt,
    wheelConfigs,
    effectiveMu,
    handbrakeForceMultiplier,
    engineForce,
    prevEffectiveSlip,
    prevSideFrictionStiffness,
  } = args

  const wheelData: WheelDriftData[] = []
  let appliedHandbrakeImpulse = false

  // Forward speed needed for handbrake impulse magnitude
  const chassisForward = quatRotate(chassisRotation, { x: 0, y: 0, z: -1 })
  const forwardSpeed = dot(chassisLinvel, chassisForward)

  for (let i = 0; i < wheelConfigs.length; i++) {
    const cfg = wheelConfigs[i]
    const isInContact = vehicleController.wheelIsInContact(i)

    // Default state (no contact → high grip)
    let slipAngleRad = 0
    let lateralForce = 0
    let longVel = 0
    let latVel = 0
    let isGripping = true
    let targetEffectiveSlip: number = VEHICLE_CONFIG.drift.baseFrictionSlip
    let gripMultiplier = 1.0

    if (isInContact && magnitude(chassisLinvel) > VEHICLE_CONFIG.drift.minSpeedThreshold) {
      // 1. Wheel position relative to COM (in world space)
      const rLocal: Vec3 = {
        x: cfg.connection[0],
        y: cfg.connection[1],
        z: cfg.connection[2],
      }
      const rWorld = quatRotate(chassisRotation, rLocal)

      // 2. Velocity at wheel contact point: v_wheel = v_com + ω × r_world
      const velFromAng = cross(chassisAngvel, rWorld)
      const wheelWorldVel = add(chassisLinvel, velFromAng)

      // 3. Get steering angle for this wheel
      const steeringAngle = vehicleController.wheelSteering(i) ?? 0

      // 4. Wheel-local forward and right directions
      const wheelForward = getWheelForward(chassisRotation, steeringAngle, cfg.isFront)
      const wheelRight = getWheelRight(chassisRotation, cfg.isLeft)

      // 5. Resolve velocity into longitudinal and lateral components
      longVel = dot(wheelWorldVel, wheelForward)
      latVel = dot(wheelWorldVel, wheelRight)

      // 6. Slip angle
      const absLong = Math.abs(longVel)
      slipAngleRad = Math.atan2(latVel, absLong)

      // 7. Estimate normal load from suspension force
      const suspensionForce = vehicleController.wheelSuspensionForce(i) ?? (VEHICLE_CONFIG.mass * 9.81) / 4
      const normalLoad = Math.max(suspensionForce, 1)

      // 8. Pacejka Magic Formula lateral force
      lateralForce = computeLateralForce(
        slipAngleRad,
        normalLoad,
        effectiveMu,
        DEFAULT_PACEJKA_COEFFS,
      )

      // 9. Friction ellipse: reduce lateral grip when using longitudinal force
      const wheelEngineForce = cfg.isFront ? 0 : engineForce
      const normalizedLong = Math.abs(wheelEngineForce) / VEHICLE_CONFIG.drivetrain.maxLongForce
      const ellipseFactor = Math.sqrt(Math.max(0, 1 - normalizedLong * normalizedLong))
      const availableLateral = effectiveMu * ellipseFactor * normalLoad
      const lateralRatio = Math.abs(lateralForce) / Math.max(availableLateral, 1)

      // Map to friction slip — higher ratio = less grip
      gripMultiplier = Math.max(0.1, 1 - lateralRatio)
      targetEffectiveSlip = Math.max(VEHICLE_CONFIG.drift.slipNearZero, VEHICLE_CONFIG.drift.baseFrictionSlip * gripMultiplier)
      isGripping = gripMultiplier > 0.3
    }

    // Handbrake override for rear wheels
    if (input.handbrake && !cfg.isFront) {
      targetEffectiveSlip = VEHICLE_CONFIG.drift.slipNearZero
      isGripping = false
      gripMultiplier = 0.0
    }

    // Compute continuous side stiffness
    const targetSideStiffness = lerp(0.3, 1.0, gripMultiplier)

    // Blend across frames using low-pass filtering
    const slipAlpha = 1 - Math.exp(-dt / VEHICLE_CONFIG.smoothing.frictionSlipTauSec)
    const sideAlpha = 1 - Math.exp(-dt / VEHICLE_CONFIG.smoothing.sideFrictionTauSec)

    const prevSlip = prevEffectiveSlip[i] ?? VEHICLE_CONFIG.drift.baseFrictionSlip
    const prevStiffness = prevSideFrictionStiffness[i] ?? 1.0

    const blendedSlip = lerp(prevSlip, targetEffectiveSlip, slipAlpha)
    const blendedStiffness = lerp(prevStiffness, targetSideStiffness, sideAlpha)

    // Save back to previous states
    prevEffectiveSlip[i] = blendedSlip
    prevSideFrictionStiffness[i] = blendedStiffness

    // Set friction slip on the controller
    vehicleController.setWheelFrictionSlip(i, blendedSlip)

    // Set side friction stiffness
    vehicleController.setWheelSideFrictionStiffness(i, blendedStiffness)

    wheelData.push({
      index: i,
      slipAngleRad,
      lateralForce,
      longitudinalVelocity: longVel,
      lateralVelocity: latVel,
      isGripping,
      effectiveFrictionSlip: blendedSlip,
    })
  }

  // Handbrake lateral impulse — kick the rear out using applyImpulseAtPoint for yaw torque
  if (input.handbrake && Math.abs(forwardSpeed) > VEHICLE_CONFIG.drift.minSpeedThreshold) {
    appliedHandbrakeImpulse = true

    // Direction perpendicular to chassis forward (right direction)
    const chassisRight = quatRotate(chassisRotation, { x: 1, y: 0, z: 0 })

    // Impulse direction: to the right if moving forward, left if reversing
    const impulseDir = forwardSpeed > 0 ? chassisRight : negate(chassisRight)
    const impulseMag = Math.min(Math.abs(forwardSpeed) * 15, 300) * handbrakeForceMultiplier

    const impulse = scale(impulseDir, impulseMag)

    // Compute rear axle midpoint in world space to apply impulse at a point
    // This creates a yaw torque around the COM instead of just sliding sideways
    const rearAxleLocal: Vec3 = {
      x: (wheelConfigs[2].connection[0] + wheelConfigs[3].connection[0]) / 2,
      y: (wheelConfigs[2].connection[1] + wheelConfigs[3].connection[1]) / 2,
      z: (wheelConfigs[2].connection[2] + wheelConfigs[3].connection[2]) / 2,
    }
    const rearAxleWorldOffset = quatRotate(chassisRotation, rearAxleLocal)
    const chassisPos = chassis.translation()
    const rearAxlePoint: Vec3 = {
      x: chassisPos.x + rearAxleWorldOffset.x,
      y: chassisPos.y + rearAxleWorldOffset.y,
      z: chassisPos.z + rearAxleWorldOffset.z,
    }

    if (chassis.applyImpulseAtPoint) {
      chassis.applyImpulseAtPoint(impulse, rearAxlePoint, true)
    } else if (chassis.applyImpulse) {
      chassis.applyImpulse(impulse, true)
    }
  }

  return { wheelData, appliedHandbrakeImpulse }
}

function negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z }
}
