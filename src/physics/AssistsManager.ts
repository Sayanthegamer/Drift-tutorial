import type { Vec3, Quat } from './vecMath'
import { quatRotate, scale, dot } from './vecMath'
import type { DriftState } from './DriftDetectionSystem'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssistParams {
  /** Effective friction coefficient for this mode */
  effectiveMu: number
  /** Counter-steer contribution added to steering input (-1..1 range) */
  autoCounterSteer: number
  /** Multiplier for handbrake lateral impulse force */
  handbrakeForceMultiplier: number
  /** Stability factor — corrective torque toward straight (0 = none) */
  stabilityFactor: number
}

// ---------------------------------------------------------------------------
// Assist parameters per mode
// ---------------------------------------------------------------------------

const ROOKIE_PARAMS: AssistParams = {
  effectiveMu: 1.15,
  autoCounterSteer: 0.3,
  handbrakeForceMultiplier: 0.6,
  stabilityFactor: 0.5,
}

const ADVANCED_PARAMS: AssistParams = {
  effectiveMu: 0.95,
  autoCounterSteer: 0,
  handbrakeForceMultiplier: 1.0,
  stabilityFactor: 0,
}

export function getDriftAssistParams(mode: 'rookie' | 'advanced'): AssistParams {
  return mode === 'rookie' ? { ...ROOKIE_PARAMS } : { ...ADVANCED_PARAMS }
}

// ---------------------------------------------------------------------------
// Apply assists
// ---------------------------------------------------------------------------

export interface ApplyAssistsResult {
  adjustedSteer: number
}

/**
 * Apply driving assists based on the current mode and drift state.
 *
 * @param currentSteer - The raw steering input value (before assists)
 * @param driftState   - Current drift detection state
 * @param params       - Assist parameters for the current mode
 * @returns Adjusted steering and stability corrections
 */
export function applyAssists(
  currentSteer: number,
  driftState: DriftState,
  params: AssistParams,
): ApplyAssistsResult {
  let adjustedSteer = currentSteer

  // Auto counter-steer: when drifting, add opposite steering proportional to drift angle
  if (params.autoCounterSteer > 0 && driftState.isDrifting) {
    const counterSteer = -driftState.driftAngle * params.autoCounterSteer
    adjustedSteer += counterSteer
  }

  return { adjustedSteer }
}

/**
 * Calculate a stability torque that tries to keep the chassis upright.
 * Applied as a torque impulse around the forward axis to counteract roll.
 */
export function computeStabilityTorque(
  chassisRotation: Quat,
  chassisAngvel: Vec3,
  params: AssistParams,
  dt: number,
): Vec3 {
  if (params.stabilityFactor <= 0) {
    return { x: 0, y: 0, z: 0 }
  }

  // Get the chassis local up axis in world space
  const localUp: Vec3 = { x: 0, y: 1, z: 0 }
  const worldUp = quatRotate(chassisRotation, localUp)

  // Desired angular velocity around forward axis = 0 (no roll)
  // Dampen the roll component
  const forward: Vec3 = { x: 0, y: 0, z: 1 }
  const worldForward = quatRotate(chassisRotation, forward)
  const rollRate = dot(chassisAngvel, worldForward)

  // Apply damping torque proportional to roll rate
  const dampingTorque = scale(worldForward, -rollRate * params.stabilityFactor * dt * 10)

  return dampingTorque
}