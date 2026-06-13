import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, Quaternion } from 'three'
import type { RapierRigidBody } from '@react-three/rapier'

const offsetDistance = 6
const offsetHeight = 2
const lookAtHeight = 1
const lerpSpeed = 5

const _pos = new Vector3()
const _quat = new Quaternion()
const _desired = new Vector3()
const _forward = new Vector3()
const _up = new Vector3(0, 1, 0)

interface ChaseCameraProps {
  target: React.RefObject<RapierRigidBody | null>
}

export default function ChaseCamera({ target }: ChaseCameraProps) {
  const { camera } = useThree()

  useFrame((_state, delta) => {
    const body = target.current
    if (!body) return

    const t = body.translation()
    const r = body.rotation()

    _pos.set(t.x, t.y, t.z)
    _quat.set(r.x, r.y, r.z, r.w)

    // Get forward direction of the chassis (local -Z in Three.js)
    _forward.set(0, 0, -1).applyQuaternion(_quat)

    // Desired camera position: behind and above the car
    _desired.copy(_pos).add(_forward.clone().multiplyScalar(-offsetDistance)).add(_up.clone().multiplyScalar(offsetHeight))

    // Lerp camera position
    camera.position.lerp(_desired, Math.min(1, lerpSpeed * delta))

    // Look at a point slightly above the car
    camera.lookAt(_pos.x, _pos.y + lookAtHeight, _pos.z)
  })

  return null
}