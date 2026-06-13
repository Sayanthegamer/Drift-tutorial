import { create } from 'zustand'

export type GameMode = 'rookie' | 'advanced'
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover'

interface GameStore {
  mode: GameMode
  driftScore: number
  gameState: GameState
  setMode: (mode: GameMode) => void
  addDriftScore: (points: number) => void
  resetDriftScore: () => void
  setGameState: (state: GameState) => void
}

export const useGameStore = create<GameStore>((set) => ({
  mode: 'rookie',
  driftScore: 0,
  gameState: 'menu',
  setMode: (mode) => set({ mode }),
  addDriftScore: (points) => set((s) => ({ driftScore: s.driftScore + points })),
  resetDriftScore: () => set({ driftScore: 0 }),
  setGameState: (gameState) => set({ gameState }),
}))
