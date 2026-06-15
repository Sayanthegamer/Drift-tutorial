import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import { getVisualEffectsData } from '../store/visualEffectsStore'

// ---------------------------------------------------------------------------
// Skid mark config
// ---------------------------------------------------------------------------
const MAX_SEGMENTS = 2000
const SEGMENT_SPACING = 0.25 // min distance between segments
const FADE_TIME = 6.0 // seconds to fully fade
const SKID_WIDTH = 0.15

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SkidVertex {
  x: number
  y: number
  z: number
  alpha: number
  age: number
}

interface SkidSegment {
  left: SkidVertex
  right: SkidVertex
  active: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SkidMarks() {
  const meshRef = useRef<Mesh>(null)

  const segments = useMemo(() => {
    const segs: SkidSegment[] = []
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      segs.push({
        left: { x: 0, y: 0, z: 0, alpha: 0, age: 0 },
        right: { x: 0, y: 0, z: 0, alpha: 0, age: 0 },
        active: false,
      })
    }
    return segs
  }, [])

  const nextSlot = useRef(0)
  const lastPositions = useRef<[Vector3, Vector3]>([new Vector3(), new Vector3()])
  const hasLastPos = useRef(false)

  // Geometry
  const geo = useMemo(() => {
    // 2 triangles per segment = 6 vertices
    const g = new BufferGeometry()
    const positions = new Float32Array(MAX_SEGMENTS * 6 * 3)
    const colors = new Float32Array(MAX_SEGMENTS * 6 * 3) // RGB for alpha
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return g
  }, [])

  useFrame((_, delta) => {
    const visualData = getVisualEffectsData()

    // Check if rear wheels are slipping (indices 2, 3)
    const rearLeft = visualData.wheels[2]
    const rearRight = visualData.wheels[3]
    const isSlipping = rearLeft.isSlipping || rearRight.isSlipping
    const intensity = Math.max(rearLeft.slipIntensity, rearRight.slipIntensity)

    // Add new segments when slipping
    if (isSlipping && intensity > 0.2) {
      const leftPos = rearLeft.worldPosition
      const rightPos = rearRight.worldPosition

      if (hasLastPos.current) {
        const distL = leftPos.distanceTo(lastPositions.current[0])
        const distR = rightPos.distanceTo(lastPositions.current[1])
        const avgDist = (distL + distR) / 2

        if (avgDist > SEGMENT_SPACING) {
          // Add segment
          addSegment(segments, nextSlot, leftPos, rightPos, intensity)
          lastPositions.current[0].copy(leftPos)
          lastPositions.current[1].copy(rightPos)
        }
      } else {
        lastPositions.current[0].copy(leftPos)
        lastPositions.current[1].copy(rightPos)
        hasLastPos.current = true
      }
    } else {
      hasLastPos.current = false
    }

    // Update all segments (age them) and rebuild geometry
    updateAndRender(segments, geo, delta)
  })

  return (
    <mesh ref={meshRef} geometry={geo}>
      <meshBasicMaterial
        color="#111111"
        transparent
        opacity={0.7}
        depthWrite={false}
        vertexColors
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addSegment(
  segments: SkidSegment[],
  nextSlot: React.MutableRefObject<number>,
  leftPos: Vector3,
  rightPos: Vector3,
  intensity: number,
) {
  const idx = nextSlot.current % MAX_SEGMENTS
  const seg = segments[idx]
  seg.active = true
  seg.left.x = leftPos.x
  seg.left.y = 0.01 // slightly above ground
  seg.left.z = leftPos.z
  seg.left.alpha = Math.min(1, 0.3 + intensity * 0.7)
  seg.left.age = 0
  seg.right.x = rightPos.x
  seg.right.y = 0.01
  seg.right.z = rightPos.z
  seg.right.alpha = Math.min(1, 0.3 + intensity * 0.7)
  seg.right.age = 0
  nextSlot.current = idx + 1
}

function updateAndRender(
  segments: SkidSegment[],
  geo: BufferGeometry,
  delta: number,
) {
  const posAttr = geo.attributes.position as Float32BufferAttribute
  const colAttr = geo.attributes.color as Float32BufferAttribute
  const positions = posAttr.array
  const colors = colAttr.array

  let vi = 0 // vertex index

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg.active) {
      // Write degenerate triangles
      for (let v = 0; v < 6; v++) {
        positions[vi * 3] = 0
        positions[vi * 3 + 1] = -100
        positions[vi * 3 + 2] = 0
        colors[vi * 3] = 0
        colors[vi * 3 + 1] = 0
        colors[vi * 3 + 2] = 0
        vi++
      }
      continue
    }

    // Age
    seg.left.age += delta
    seg.right.age += delta
    const lifeRatio = Math.min(1, seg.left.age / FADE_TIME)
    const alpha = seg.left.alpha * Math.max(0, 1 - lifeRatio)

    if (alpha <= 0.01) {
      seg.active = false
      for (let v = 0; v < 6; v++) {
        positions[vi * 3] = 0
        positions[vi * 3 + 1] = -100
        positions[vi * 3 + 2] = 0
        colors[vi * 3] = 0
        colors[vi * 3 + 1] = 0
        colors[vi * 3 + 2] = 0
        vi++
      }
      continue
    }

    // Two triangles: left-right triangle strip
    // Triangle 1: left, right, left+forward
    // Triangle 2: right, left+forward, right+forward
    // For simplicity, use a quad: left->right->right_next->left_next

    const lx = seg.left.x
    const lz = seg.left.z
    const rx = seg.right.x
    const rz = seg.right.z

    // Compute forward direction (same as right-left perpendicular)
    const dx = rx - lx
    const dz = rz - lz
    const len = Math.sqrt(dx * dx + dz * dz) || 0.001
    const nx = -dz / len
    const nz = dx / len

    // Forward offset (small to give the segment some length)
    const forward = 0.15
    const lxf = lx + nx * forward
    const lzf = lz + nz * forward
    const rxf = rx + nx * forward
    const rzf = rz + nz * forward

    // 4 vertices (quad): TL, TR, BL, BR
    const verts = [
      { x: lx, z: lz },
      { x: rx, z: rz },
      { x: lxf, z: lzf },
      { x: rxf, z: rzf },
    ]

    // Two triangles: (0,1,2) and (1,3,2)
    const triIndices = [0, 1, 2, 1, 3, 2]

    for (const ti of triIndices) {
      const v = verts[ti]
      positions[vi * 3] = v.x
      positions[vi * 3 + 1] = 0.01
      positions[vi * 3 + 2] = v.z
      colors[vi * 3] = alpha
      colors[vi * 3 + 1] = alpha
      colors[vi * 3 + 2] = alpha
      vi++
    }
  }

  posAttr.needsUpdate = true
  colAttr.needsUpdate = true
}