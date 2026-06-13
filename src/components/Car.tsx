import { useRef } from 'react'
import { Group } from 'three'
import { RigidBody, CuboidCollider } from '@react-three/rapier'

const BODY_WIDTH = 1.2
const BODY_HEIGHT = 0.4
const BODY_LENGTH = 2.4
const WHEEL_RADIUS = 0.3
const WHEEL_HEIGHT = 0.2
const AXLE_OFFSET = 0.8

interface CarProps {
  position?: [number, number, number]
}

export default function Car({ position = [0, 0.5, 0] }: CarProps) {
  const groupRef = useRef<Group>(null)

  const wheelPositions: [number, number, number][] = [
    [-BODY_WIDTH / 2 - 0.1, -BODY_HEIGHT / 2, AXLE_OFFSET],
    [BODY_WIDTH / 2 + 0.1, -BODY_HEIGHT / 2, AXLE_OFFSET],
    [-BODY_WIDTH / 2 - 0.1, -BODY_HEIGHT / 2, -AXLE_OFFSET],
    [BODY_WIDTH / 2 + 0.1, -BODY_HEIGHT / 2, -AXLE_OFFSET],
  ]

  return (
    <group ref={groupRef} position={position}>
      {/* Car body — single rigid body */}
      <RigidBody type="dynamic" colliders={false} mass={1.5} position={[0, BODY_HEIGHT / 2, 0]}>
        <CuboidCollider args={[BODY_WIDTH / 2, BODY_HEIGHT / 2, BODY_LENGTH / 2]} />

        {/* Body mesh */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH]} />
          <meshStandardMaterial color="#e53935" />
        </mesh>

        {/* Cabin / roof */}
        <mesh position={[0, BODY_HEIGHT / 2 + 0.15, -0.15]} castShadow>
          <boxGeometry args={[BODY_WIDTH * 0.8, 0.25, BODY_LENGTH * 0.5]} />
          <meshStandardMaterial color="#212121" />
        </mesh>

        {/* Wheels (visual only — attached to body) */}
        {wheelPositions.map((pos, idx) => (
          <mesh key={idx} position={pos} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_HEIGHT, 24]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
      </RigidBody>
    </group>
  )
}
