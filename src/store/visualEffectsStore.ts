import type { Vector3 } from 'three'

export interface WheelVisualState {
  worldPosition: Vector3
  isSlipping: boolean
  slipIntensity: number
  longitudinalVelocity: number
}

export interface VisualEffectsData {
  wheels: WheelVisualState[]
  isDrifting: boolean
  speedKmh: number
}

let _data: VisualEffectsData = {
  wheels: [
    { worldPosition: { x: 0, y: 0, z: 0 } as Vector3, isSlipping: false, slipIntensity: 0, longitudinalVelocity: 0 },
    { worldPosition: { x: 0, y: 0, z: 0 } as Vector3, isSlipping: false, slipIntensity: 0, longitudinalVelocity: 0 },
    { worldPosition: { x: 0, y: 0, z: 0 } as Vector3, isSlipping: false, slipIntensity: 0, longitudinalVelocity: 0 },
    { worldPosition: { x: 0, y: 0, z: 0 } as Vector3, isSlipping: false, slipIntensity: 0, longitudinalVelocity: 0 },
  ],
  isDrifting: false,
  speedKmh: 0,
}

export function getVisualEffectsData(): VisualEffectsData {
  return _data
}

export function setVisualEffectsData(data: VisualEffectsData) {
  _data = data
}
