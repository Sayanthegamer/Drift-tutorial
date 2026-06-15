import { Suspense } from 'react'
import Scene from './components/Scene'
import HUD from './components/ui/HUD'

function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Loading…</div>}>
        <Scene />
      </Suspense>
      <HUD />
    </div>
  )
}

export default App