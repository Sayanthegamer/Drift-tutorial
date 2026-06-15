import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  Color,
  Vector3,
  CanvasTexture,
} from 'three'
import { getVisualEffectsData } from '../store/visualEffectsStore'

// ---------------------------------------------------------------------------
// Particle config
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 400
const SPAWN_RATE = 8 // particles per slipping wheel per frame
const PARTICLE_LIFE = 1.8 // seconds
const PARTICLE_SIZE_START = 0.4
const PARTICLE_SIZE_END = 1.6
const RISE_SPEED = 0.6
const DRIFT_SPEED = 0.3

// ---------------------------------------------------------------------------
// Smoke sprite texture
// ---------------------------------------------------------------------------
function createSmokeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)')
  gradient.addColorStop(0.6, 'rgba(200,200,200,0.4)')
  gradient.addColorStop(1, 'rgba(180,180,180,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  return new CanvasTexture(canvas)
}

// ---------------------------------------------------------------------------
// Particle data
// ---------------------------------------------------------------------------
interface Particle {
  position: Vector3
  velocity: Vector3
  life: number
  maxLife: number
  size: number
  active: boolean
}

const _tempVec = new Vector3()

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TireSmoke() {
  const pointsRef = useRef<Points>(null)
  const particles = useRef<Particle[]>([])

  // Initialize particle pool
  useMemo(() => {
    const pool: Particle[] = []
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pool.push({
        position: new Vector3(0, -100, 0), // hidden
        velocity: new Vector3(0, 0, 0),
        life: 0,
        maxLife: 1,
        size: 0,
        active: false,
      })
    }
    particles.current = pool
  }, [])

  // Smoke texture
  const smokeTex = useMemo(() => createSmokeTexture(), [])

  // Geometry attributes (reused)
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    const positions = new Float32Array(MAX_PARTICLES * 3)
    const sizes = new Float32Array(MAX_PARTICLES)
    const opacities = new Float32Array(MAX_PARTICLES)
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('size', new Float32BufferAttribute(sizes, 1))
    g.setAttribute('opacity', new Float32BufferAttribute(opacities, 1))
    return g
  }, [])

  useFrame((_, delta) => {
    const visualData = getVisualEffectsData()
    const posAttr = geo.attributes.position as Float32BufferAttribute
    const sizeAttr = geo.attributes.size as Float32BufferAttribute
    const opacityAttr = geo.attributes.opacity as Float32BufferAttribute

    // Spawn new particles from slipping wheels
    if (visualData.isDrifting) {
      for (let w = 2; w < 4; w++) {
        // Only rear wheels
        const wheel = visualData.wheels[w]
        if (wheel.isSlipping && wheel.slipIntensity > 0.3) {
          for (let s = 0; s < SPAWN_RATE; s++) {
            // Find an inactive particle
            const pool = particles.current
            let spawned = false
            for (let i = 0; i < pool.length; i++) {
              if (!pool[i].active) {
                const p = pool[i]
                p.active = true
                p.position.copy(wheel.worldPosition)
                // Random offset for spread
                p.position.x += (Math.random() - 0.5) * 0.6
                p.position.z += (Math.random() - 0.5) * 0.6
                p.position.y += Math.random() * 0.1
                p.velocity.set(
                  (Math.random() - 0.5) * DRIFT_SPEED,
                  RISE_SPEED * (0.5 + Math.random()),
                  (Math.random() - 0.5) * DRIFT_SPEED,
                )
                p.life = 0
                p.maxLife = PARTICLE_LIFE * (0.6 + Math.random() * 0.4)
                p.size = PARTICLE_SIZE_START * (0.8 + Math.random() * 0.4)
                spawned = true
                break
              }
            }
            if (!spawned) break
          }
        }
      }
    }

    // Update all active particles
    const pool = particles.current
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]
      if (!p.active) {
        posAttr.array[i * 3] = 0
        posAttr.array[i * 3 + 1] = -100
        posAttr.array[i * 3 + 2] = 0
        sizeAttr.array[i] = 0
        opacityAttr.array[i] = 0
        continue
      }

      p.life += delta
      if (p.life >= p.maxLife) {
        p.active = false
        posAttr.array[i * 3] = 0
        posAttr.array[i * 3 + 1] = -100
        posAttr.array[i * 3 + 2] = 0
        sizeAttr.array[i] = 0
        opacityAttr.array[i] = 0
        continue
      }

      const lifeRatio = p.life / p.maxLife

      // Move
      p.position.x += p.velocity.x * delta
      p.position.y += p.velocity.y * delta
      p.position.z += p.velocity.z * delta

      // Grow then fade
      const size = p.size + (PARTICLE_SIZE_END - p.size) * lifeRatio
      const opacity = Math.max(0, 1 - lifeRatio * lifeRatio)

      posAttr.array[i * 3] = p.position.x
      posAttr.array[i * 3 + 1] = p.position.y
      posAttr.array[i * 3 + 2] = p.position.z
      sizeAttr.array[i] = size
      opacityAttr.array[i] = opacity
    }

    posAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
    opacityAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        size={1}
        map={smokeTex}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        opacity={0.35}
        color={new Color(0.8, 0.8, 0.85)}
        sizeAttenuation
      />
    </points>
  )
}