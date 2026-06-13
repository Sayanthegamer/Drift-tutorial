import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import Lighting from './Lighting'
import TestGround from './TestGround'
import Car from './Car'
import ChaseCamera from './ChaseCamera'
import { setupInputListeners } from '../store/inputStore'
import type { RapierRigidBody } from '@react-three/rapier'

export default function Scene() {
  const carRef = useRef<RapierRigidBody>(null)

  useEffect(() => {
    const cleanup = setupInputListeners()
    return cleanup
  }, [])

  return (
    <Canvas
      shadows
      camera={{ position: [0, 5, 10], fov: 70, near: 0.1, far: 100 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#1a1a2e']} />

      <Lighting />

      <Physics gravity={[0, -9.81, 0]}>
        <TestGround />
        <Car chassisRef={carRef} />
      </Physics>

      <ChaseCamera target={carRef} />
    </Canvas>
  )
}