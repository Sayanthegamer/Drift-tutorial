import { useRef } from 'react'
import { DirectionalLight, Fog } from 'three'

export default function Lighting() {
  const dirLight = useRef<DirectionalLight>(null)

  return (
    <>
      {/* Ambient fill */}
      <ambientLight intensity={0.3} color="#404060" />

      {/* Key light — warm directional */}
      <directionalLight
        ref={dirLight}
        position={[15, 20, 10]}
        intensity={1.5}
        color="#ffeedd"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={60}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.001}
      />

      {/* Fill light from below/cool side */}
      <directionalLight
        position={[-10, 5, -8]}
        intensity={0.4}
        color="#8888ff"
      />

      {/* Hemisphere for sky/ground color bleed */}
      <hemisphereLight args={['#87CEEB', '#2a2a3a', 0.4]} />

      {/* Atmospheric fog */}
      <fog attach="fog" args={['#1a1a2e', 20, 50]} />
    </>
  )
}
