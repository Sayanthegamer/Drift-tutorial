/**
 * Pure vector math utilities for Rapier3D compat types.
 * Avoids allocations by using plain objects where possible.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

export function normalize(v: Vec3): Vec3 {
  const m = magnitude(v)
  if (m < 1e-10) return { x: 0, y: 0, z: 0 }
  return { x: v.x / m, y: v.y / m, z: v.z / m }
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z }
}

/**
 * Rotate a vector by a quaternion using the standard formula:
 *   v' = v + 2 * qw * (q.xyz × v) + 2 * (q.xyz × (q.xyz × v))
 *
 * Simplified: t = 2 * cross(q.xyz, v)
 *             v' = v + qw * t + cross(q.xyz, t)
 */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const qx = q.x
  const qy = q.y
  const qz = q.z
  const qw = q.w

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * v.z - qz * v.y)
  const ty = 2 * (qz * v.x - qx * v.z)
  const tz = 2 * (qx * v.y - qy * v.x)

  // v' = v + qw * t + cross(q.xyz, t)
  return {
    x: v.x + qw * tx + (qy * tz - qz * ty),
    y: v.y + qw * ty + (qz * tx - qx * tz),
    z: v.z + qw * tz + (qx * ty - qy * tx),
  }
}

/**
 * Rotate a vector v around a given axis (unit vector) by angle radians.
 * Rodrigues' rotation formula.
 */
export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const axisCrossV = cross(axis, v)
  const axisDotV = dot(axis, v)
  return {
    x: v.x * cosA + axisCrossV.x * sinA + axis.x * axisDotV * (1 - cosA),
    y: v.y * cosA + axisCrossV.y * sinA + axis.y * axisDotV * (1 - cosA),
    z: v.z * cosA + axisCrossV.z * sinA + axis.z * axisDotV * (1 - cosA),
  }
}