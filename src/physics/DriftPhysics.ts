import { computeLateralForce, DEFAULT_PACEJKA_COEFFS } from './TireModel'
import type { Vec3, Quat } from './vecMath'
import {
  cross,
  dot,
  magnitude,
  normalize,
  scale,
  add,
  sub,
  quatRotate,
  rotateAroundAxis,
} from './vecMath'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum speed (m/s) below which drift physics are disabled */
const MIN_SPEED_THRESHOLD = 0.5

/** Base friction slip for dry tarmac */
const BASE_FRICTION_SLIP = 1.0

/** Near-zero friction slip used when breaking traction (handbrake) */
const SLIP_NEAR_ZERO = 0.1

/** Maximum longitudinal force the engine can produce (matched to ENGINE_FORCE) */
const MAX_LONG_FORCE = 800

/** Forward axis index in Rapier's vehicle controller (Z = 2) */
const FORWARD_AXIS = 2

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
}

export interface DriftPhysicsResult {
  wheelData: WheelDriftData[]
  appliedHandbrakeImpulse: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the wheel's local forward direction in world space.
 * Front wheels are affected by steering; rear wheels are not.
 */
function getWheelForward(
  rotation: Quat,
  steeringAngle: number,
  isFront: boolean,
): Vec3 {
  // Chassis-local forward is (0, 0, 1) when indexForwardAxis = 2
  const localForward: Vec3 = { x: 0, y: 0, z: 1 }
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
function getWheelRight(rotation: Quat, isLeft: boolean): Vec3 {
  const ax = isLeft ? -1 : 1
  const localRight: Vec3 = { x: ax, y: 0, z: 0 }
  return quatRotate(rotation, localRight)
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Per-frame drift physics update.
 *
 * For each wheel:
 *  1. Compute the wheel contact point velocity in world space.
 *  2. Resolve into longitudinal and lateral components in the wheel's local frame.
 *  3. Compute slip angle.
 *  4. Estimate normal load from suspension force.
 *  5. Compute Pacejka lateral force → derive desired friction slip.
 *  6. Apply friction ellipse coupling.
 *  7. Set the friction slip on the vehicle controller.
 *
 * Handbrake drops rear friction to near-zero and applies a lateral impulse
 * to kick the rear out.
 */
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
  } = args

  const wheelData: WheelDriftData[] = []
  let appliedHandbrakeImpulse = false

  // Forward speed needed for handbrake impulse magnitude
  const chassisForward = quatRotate(chassisRotation, { x: 0, y: 0, z: 1 })
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
    let effectiveSlip = BASE_FRICTION_SLIP

    if (isInContact && magnitude(chassisLinvel) > MIN_SPEED_THRESHOLD) {
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
      const suspensionForce = vehicleController.wheelSuspensionForce(i) ?? (150 * 9.81) / 4
      const normalLoad = Math.max(suspensionForce, 1)

      // 8. Pacejka Magic Formula lateral force
      lateralForce = computeLateralForce(
        slipAngleRad,
        normalLoad,
        effectiveMu,
        DEFAULT_PACEJKA_COEFFS,
      )

      // 9. Friction ellipse: reduce lateral grip when using longitudinal force
      const engineForce = vehicleController.wheelEngineForce(i) ?? 0
      const normalizedLong = Math.abs(engineForce) / MAX_LONG_FORCE
      const ellipseFactor = Math.sqrt(Math.max(0, 1 - normalizedLong * normalizedLong))
      const availableLateral = effectiveMu * ellipseFactor * normalLoad
      const lateralRatio = Math.abs(lateralForce) / Math.max(availableLateral, 1)

      // Map to friction slip — higher ratio = less grip
      const gripMultiplier = Math.max(0.1, 1 - lateralRatio)
      effectiveSlip = Math.max(SLIP_NEAR_ZERO, BASE_FRICTION_SLIP * gripMultiplier)
      isGripping = gripMultiplier > 0.3
    }

    // Handbrake override for rear wheels
    if (input.handbrake && !cfg.isFront) {
      effectiveSlip = SLIP_NEAR_ZERO
      isGripping = false
    }

    // Set friction slip on the controller
    vehicleController.setWheelFrictionSlip(i, effectiveSlip)

    // Adjust side friction stiffness — lower during slip
    const sideStiffness = isGripping ? 1.0 : 0.3
    vehicleController.setWheelSideFrictionStiffness(i, sideStiffness)

    wheelData.push({
      index: i,
      slipAngleRad,
      lateralForce,
      longitudinalVelocity: longVel,
      lateralVelocity: latVel,
      isGripping,
      effectiveFrictionSlip: effectiveSlip,
    })
  }

  // Handbrake lateral impulse — kick the rear out
  if (input.handbrake && Math.abs(forwardSpeed) > MIN_SPEED_THRESHOLD) {
    appliedHandbrakeImpulse = true

    // Direction perpendicular to chassis forward (right direction)
    const chassisRight = quatRotate(chassisRotation, { x: 1, y: 0, z: 0 })

    // Impulse direction: to the right if moving forward, left if reversing
    const impulseDir = forwardSpeed > 0 ? chassisRight : negate(chassisRight)
    const impulseMag = Math.min(Math.abs(forwardSpeed) * 15, 300) * handbrakeForceMultiplier

    const impulse = scale(impulseDir, impulseMag)
    if (chassis.applyImpulse) {
      chassis.applyImpulse(impulse, true)
    }
  }

  return { wheelData, appliedHandbrakeImpulse }
}

function negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z }
}