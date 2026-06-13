import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import Lighting from './Lighting'
import TestGround from './TestGround'
import Car from './Car'

export default function Scene() {
  return (
    <Canvas
      shadows
      camera={{ position: [6, 5, 8], fov: 55 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#1a1a2e']} />

      <Lighting />

      <Physics gravity={[0, -9.81, 0]}>
        <TestGround />
        <Car position={[0, 1.5, 0]} />
      </Physics>

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  )
}
