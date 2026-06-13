import { useRef } from 'react'
import { DirectionalLight } from 'three'

export default function Lighting() {
  const dirLight = useRef<DirectionalLight>(null)
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        ref={dirLight}
        position={[15, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight args={['#87CEEB', '#444444', 0.3]} />
    </>
  )
}
