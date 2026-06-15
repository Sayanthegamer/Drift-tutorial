export { computeLateralForce, DEFAULT_PACEJKA_COEFFS } from './TireModel'
export type { PacejkaCoeffs } from './TireModel'

export { VEHICLE_CONFIG } from './VehicleConfig'

export { computeResistanceForce } from './Resistance'
export type { ResistanceParams } from './Resistance'

export { updateDriftPhysics } from './DriftPhysics'
export type { DriftPhysicsArgs, DriftPhysicsResult, WheelDriftData, WheelConfig } from './DriftPhysics'

export { getDriftAssistParams, applyAssists, computeStabilityTorque } from './AssistsManager'
export type { AssistParams, ApplyAssistsResult } from './AssistsManager'

export { createDriftDetectionSystem } from './DriftDetectionSystem'
export type { DriftDetectionSystem, DriftState } from './DriftDetectionSystem'

export type { Vec3, Quat } from './vecMath'