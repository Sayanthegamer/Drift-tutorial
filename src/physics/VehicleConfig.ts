export const VEHICLE_CONFIG = {
  mass: 150,
  wheelRadius: 0.3,

  suspension: {
    stiffness: 50,
    compression: 8,
    relaxation: 10,
    maxTravel: 0.5,
    maxForce: 10000,
  },

  resistance: {
    dragCoefficient: 0.4,     // tune in Phase 1.3
    rollingResistance: 8.0,   // tune in Phase 1.3
  },

  drivetrain: {
    engineForce: 800,
    maxBrakeForce: 100,
    handbrakeForce: 300,
    maxSteer: 0.5,
    maxLongForce: 800,
    gearRatios: [3.6, 2.4, 1.8, 1.4, 1.1, 0.9],
    reverseRatio: -3.2,
    finalDrive: 3.7,
    idleRpm: 900,
    redlineRpm: 7200,
    shiftUpRpm: 6800,
    shiftDownRpm: 2500,
    shiftCooldownSec: 0.35,
  },

  drift: {
    enterAngleRad: 0.18,
    exitAngleRad: 0.10,
    minYawRate: 0.1,
    minDriftDurationSec: 0.15,
    scoreAccumulationRate: 1.0,
    minSpeedThreshold: 0.5,
    baseFrictionSlip: 1.0,
    slipNearZero: 0.1,
  },

  smoothing: {
    frictionSlipTauSec: 0.1,
    sideFrictionTauSec: 0.1,
  },
} as const
