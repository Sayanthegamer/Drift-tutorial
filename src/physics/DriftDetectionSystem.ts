import type { Vec3 } from './vecMath'
import { VEHICLE_CONFIG } from './VehicleConfig'

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

      // State machine with hysteresis
      const wasDrifting = isDrifting

      if (!wasDrifting) {
        // Not drifting -> drifting transition
        if (avgRearSlip > VEHICLE_CONFIG.drift.enterAngleRad && yawRate > VEHICLE_CONFIG.drift.minYawRate) {
          isDrifting = true
          driftDuration = 0
        }
      } else {
        // Drifting -> drifting/not drifting transition
        driftDuration += dt
        if (avgRearSlip < VEHICLE_CONFIG.drift.exitAngleRad && driftDuration >= VEHICLE_CONFIG.drift.minDriftDurationSec) {
          isDrifting = false
          driftDuration = 0
        }
      }

      if (isDrifting) {
        // Accumulate score
        if (!wasDrifting) {
          driftDuration += dt
        }
        driftScore += yawRate * avgRearSlip * VEHICLE_CONFIG.drift.scoreAccumulationRate * dt
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
