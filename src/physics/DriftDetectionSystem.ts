import type { Vec3 } from './vecMath'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftState {
  isDrifting: boolean
  driftAngle: number
  yawRate: number
  driftDuration: number
  driftScore: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum rear slip angle (rad) to consider the car drifting (~8.5°) */
const DRIFT_ANGLE_THRESHOLD = 0.15

/** Minimum yaw rate (rad/s) to consider the car rotating */
const MIN_YAW_RATE = 0.1

/** Factor for accumulating drift score per second */
const SCORE_ACCUMULATION_RATE = 1.0

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export interface DriftDetectionSystem {
  /**
   * Update the drift detection state each frame.
   *
   * @param rearSlipAngles - Slip angles for rear wheels (indices 2, 3) in radians
   * @param angvel         - Chassis angular velocity (world space)
   * @param dt             - Time delta (seconds)
   */
  update: (rearSlipAngles: number[], angvel: Vec3, dt: number) => DriftState

  /** Get the current drift state without updating */
  getState: () => DriftState

  /** Reset all drift tracking to zero */
  reset: () => void
}

/**
 * Create a drift detection system that tracks drift state per-frame.
 */
export function createDriftDetectionSystem(): DriftDetectionSystem {
  let isDrifting = false
  let driftAngle = 0
  let yawRate = 0
  let driftDuration = 0
  let driftScore = 0

  return {
    update(rearSlipAngles: number[], angvel: Vec3, dt: number): DriftState {
      // Average rear slip angle magnitude
      const avgRearSlip =
        rearSlipAngles.length > 0
          ? rearSlipAngles.reduce((sum, v) => sum + Math.abs(v), 0) / rearSlipAngles.length
          : 0

      // Yaw rate is angular velocity around the Y (up) axis
      yawRate = Math.abs(angvel.y)
      driftAngle = avgRearSlip

      // Determine if currently drifting
      const wasDrifting = isDrifting
      isDrifting = avgRearSlip > DRIFT_ANGLE_THRESHOLD && yawRate > MIN_YAW_RATE

      if (isDrifting) {
        driftDuration += dt

        // Accumulate score: integral of |yawRate| * |avgRearSlip| over time
        driftScore += yawRate * avgRearSlip * SCORE_ACCUMULATION_RATE * dt
      } else if (wasDrifting) {
        // End of drift — reset duration but keep accumulated score
        driftDuration = 0
      }

      return { isDrifting, driftAngle, yawRate, driftDuration, driftScore }
    },

    getState(): DriftState {
      return { isDrifting, driftAngle, yawRate, driftDuration, driftScore }
    },

    reset() {
      isDrifting = false
      driftAngle = 0
      yawRate = 0
      driftDuration = 0
      driftScore = 0
    },
  }
}