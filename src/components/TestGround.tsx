import { useMemo, useRef } from 'react'
import { Mesh, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { RigidBody, CuboidCollider } from '@react-three/rapier'

const SIZE = 40
const DIVISIONS = 20

function createCheckerTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  const cellPx = 512 / DIVISIONS
  for (let i = 0; i < DIVISIONS; i++) {
    for (let j = 0; j < DIVISIONS; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#e0e0e0' : '#333333'
      ctx.fillRect(i * cellPx, j * cellPx, cellPx, cellPx)
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 1)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export default function TestGround() {
  const meshRef = useRef<Mesh>(null)
  const texture = useMemo(() => createCheckerTexture(), [])

  return (
    <RigidBody type="fixed" position={[0, -0.05, 0]}>
      <CuboidCollider args={[SIZE / 2, 0.05, SIZE / 2]} />
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </RigidBody>
  )
}
