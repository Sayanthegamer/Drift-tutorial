import { useMemo, useRef } from 'react'
import {
  Mesh,
  CatmullRomCurve3,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  CanvasTexture,
  RepeatWrapping,
} from 'three'
import { RigidBody, CuboidCollider } from '@react-three/rapier'

// ---------------------------------------------------------------------------
// Track design — closed loop defined by control points
// ---------------------------------------------------------------------------
const TRACK_WIDTH = 8
const WALL_HEIGHT = 1.2
const WALL_THICKNESS = 0.4

const CONTROL_POINTS = [
  [0, 0, -18],
  [10, 0, -8],
  [12, 0, 6],
  [6, 0, 16],
  [-6, 0, 18],
  [-14, 0, 10],
  [-14, 0, -4],
  [-8, 0, -14],
]

const POINTS_OBJ = CONTROL_POINTS.map((p) => new Vector3(p[0], p[1], p[2]))

function buildTrackSpline(): CatmullRomCurve3 {
  return new CatmullRomCurve3(POINTS_OBJ, true, 'catmullrom', 1.0)
}

// ---------------------------------------------------------------------------
// Build road mesh from curve
// ---------------------------------------------------------------------------
const SEGMENTS = 80

function buildRoadGeometry(curve: CatmullRomCurve3): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const halfW = TRACK_WIDTH / 2

  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS
    const pt = curve.getPoint(t)
    const tangent = curve.getTangent(t)
    const up = new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(tangent, up).normalize()

    // Left and right edges
    const left = pt.clone().add(right.clone().multiplyScalar(-halfW))
    const rightPt = pt.clone().add(right.clone().multiplyScalar(halfW))

    positions.push(left.x, 0, left.z, rightPt.x, 0, rightPt.z)
    const u = i / SEGMENTS
    uvs.push(u, 0, u, 1)
  }

  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2
    const b = i * 2 + 1
    const c = (i + 1) * 2
    const d = (i + 1) * 2 + 1
    indices.push(a, c, b, b, c, d)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ---------------------------------------------------------------------------
// Collider wall data
// ---------------------------------------------------------------------------
interface WallData {
  position: [number, number, number]
  halfExtents: [number, number, number]
  rotation: number
}

function buildWallData(curve: CatmullRomCurve3): WallData[] {
  const walls: WallData[] = []
  const wallSegments = 40
  const halfW = TRACK_WIDTH / 2

  for (let i = 0; i < wallSegments; i++) {
    const t = i / wallSegments
    const tNext = (i + 1) / wallSegments
    const pt = curve.getPoint(t)
    const ptNext = curve.getPoint(tNext)
    const tangent = curve.getTangent(t)
    const up = new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(tangent, up).normalize()

    const mid = pt.clone().add(ptNext).multiplyScalar(0.5)
    const segLen = pt.distanceTo(ptNext)

    // Inner wall
    const innerPos = mid.clone().add(right.clone().multiplyScalar(-halfW - WALL_THICKNESS / 2))
    walls.push({
      position: [innerPos.x, WALL_HEIGHT / 2, innerPos.z],
      halfExtents: [segLen / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2],
      rotation: Math.atan2(tangent.x, tangent.z),
    })

    // Outer wall
    const outerPos = mid.clone().add(right.clone().multiplyScalar(halfW + WALL_THICKNESS / 2))
    walls.push({
      position: [outerPos.x, WALL_HEIGHT / 2, outerPos.z],
      halfExtents: [segLen / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2],
      rotation: Math.atan2(tangent.x, tangent.z),
    })
  }

  return walls
}

// ---------------------------------------------------------------------------
// Asphalt texture
// ---------------------------------------------------------------------------
function createAsphaltTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(0, 0, 256, 256)

  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const b = 40 + Math.random() * 30
    ctx.fillStyle = `rgb(${b},${b},${b})`
    ctx.fillRect(x, y, 1, 1)
  }

  // Center line
  ctx.strokeStyle = '#aaaaaa'
  ctx.lineWidth = 3
  ctx.setLineDash([20, 15])
  ctx.beginPath()
  ctx.moveTo(128, 0)
  ctx.lineTo(128, 256)
  ctx.stroke()

  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.repeat.set(4, 1)
  tex.anisotropy = 4
  return tex
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Track() {
  const curve = useMemo(() => buildTrackSpline(), [])
  const roadGeo = useMemo(() => buildRoadGeometry(curve), [curve])
  const walls = useMemo(() => buildWallData(curve), [curve])
  const asphaltTex = useMemo(() => createAsphaltTexture(), [])

  const wallRefs = useRef<(Mesh | null)[]>([])

  return (
    <group>
      {/* Road surface */}
      <RigidBody type="fixed" position={[0, -0.05, 0]}>
        {/* Large ground colliders covering the entire track area */}
        <CuboidCollider
          args={[25, 0.05, 25]}
          position={[0, 0, 0]}
          restitution={0.0}
          friction={0.8}
        />
        <CuboidCollider
          args={[12, 0.05, 15]}
          position={[14, 0, 5]}
          restitution={0.0}
          friction={0.8}
        />
        <CuboidCollider
          args={[12, 0.05, 15]}
          position={[-14, 0, 5]}
          restitution={0.0}
          friction={0.8}
        />
        <CuboidCollider
          args={[20, 0.05, 10]}
          position={[0, 0, 20]}
          restitution={0.0}
          friction={0.8}
        />
        <CuboidCollider
          args={[20, 0.05, 10]}
          position={[0, 0, -15]}
          restitution={0.0}
          friction={0.8}
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <primitive object={roadGeo} attach="geometry" />
          <meshStandardMaterial map={asphaltTex} roughness={0.9} metalness={0.0} />
        </mesh>
      </RigidBody>

      {/* Track edge walls */}
      {walls.map((wall, idx) => (
        <RigidBody key={idx} type="fixed" position={wall.position}>
          <CuboidCollider
            args={wall.halfExtents}
            restitution={0.1}
            friction={0.5}
          />
          <mesh
            ref={(el) => { wallRefs.current[idx] = el }}
            position={[0, 0, 0]}
            rotation={[0, wall.rotation, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wall.halfExtents[0] * 2, wall.halfExtents[1] * 2, wall.halfExtents[2] * 2]} />
            <meshStandardMaterial color="#666666" roughness={0.8} metalness={0.1} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  )
}