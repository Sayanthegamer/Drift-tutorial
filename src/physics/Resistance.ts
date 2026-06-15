import type { Vec3 } from './vecMath'
import { magnitude, normalize, scale } from './vecMath'

export interface ResistanceParams {
  dragCoefficient: number   // quadratic, opposes v^2
  rollingResistance: number // linear, opposes v
}

export function computeResistanceForce(
  velocity: Vec3,
  params: ResistanceParams,
): Vec3 {
  const speed = magnitude(velocity)
  if (speed < 1e-4) return { x: 0, y: 0, z: 0 }
  const dir = normalize(velocity)
  const dragMag = params.dragCoefficient * speed * speed
  const rrMag = params.rollingResistance * speed
  return scale(dir, -(dragMag + rrMag))
}
