import { create } from 'zustand'

export interface TelemetryData {
  speedKmh: number
  rpm: number
  gear: string
  slipAngleDeg: number
  isDrifting: boolean
}

interface TelemetryStore extends TelemetryData {
  publish: (data: TelemetryData) => void
}

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  speedKmh: 0,
  rpm: 0,
  gear: 'N',
  slipAngleDeg: 0,
  isDrifting: false,
  publish: (data) => set(data),
}))