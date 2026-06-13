/**
 * Simplified Pacejka Magic Formula tire model.
 *
 * Fy = D * sin(C * atan(B * α - E * (B * α - atan(B * α))))
 *
 * Where:
 *   D = μ * Fz    (peak factor)
 *   B = stiffness factor
 *   C = shape factor
 *   E = curvature factor
 *   α = slip angle (radians)
 *   Fz = normal load
 *   μ = friction coefficient
 */

export interface PacejkaCoeffs {
  /** Stiffness factor — controls the slope near zero slip angle */
  B: number
  /** Shape factor — typically 1.3–1.4 */
  C: number
  /** Curvature factor — typically -2.0 to 0.0 */
  E: number
}

export const DEFAULT_PACEJKA_COEFFS: PacejkaCoeffs = {
  B: 0.18,
  C: 1.3,
  E: -2.0,
}

/**
 * Compute lateral force using the simplified Pacejka Magic Formula.
 *
 * @param slipAngleRad - Slip angle in radians (positive = turning left relative to travel)
 * @param normalForce  - Normal load on the tire (N)
 * @param frictionCoeff - Surface friction coefficient (μ)
 * @param coeffs       - Optional Pacejka coefficients (defaults used if omitted)
 * @returns Lateral force (N)
 */
export function computeLateralForce(
  slipAngleRad: number,
  normalForce: number,
  frictionCoeff: number,
  coeffs: PacejkaCoeffs = DEFAULT_PACEJKA_COEFFS,
): number {
  const D = frictionCoeff * normalForce
  const Bα = coeffs.B * slipAngleRad
  const arctanBα = Math.atan(Bα)
  const inner = Bα - coeffs.E * (Bα - arctanBα)
  const Fy = D * Math.sin(coeffs.C * Math.atan(inner))
  return Fy
}