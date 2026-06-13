import { create } from 'zustand'

interface InputState {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  handbrake: boolean
}

interface InputStore extends InputState {
  setKey: (key: string, pressed: boolean) => void
}

export const useInputStore = create<InputStore>((set) => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
  setKey: (key: string, pressed: boolean) => {
    switch (key) {
      case 'w':
      case 'W':
        set({ forward: pressed })
        break
      case 's':
      case 'S':
        set({ backward: pressed })
        break
      case 'a':
      case 'A':
        set({ left: pressed })
        break
      case 'd':
      case 'D':
        set({ right: pressed })
        break
      case ' ':
        set({ handbrake: pressed })
        break
    }
  },
}))

export function setupInputListeners(): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (['w', 'W', 's', 'S', 'a', 'A', 'd', 'D', ' '].includes(e.key)) {
      e.preventDefault()
    }
    useInputStore.getState().setKey(e.key, true)
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    useInputStore.getState().setKey(e.key, false)
  }

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  return () => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
  }
}