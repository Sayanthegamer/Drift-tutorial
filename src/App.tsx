import { Suspense } from 'react'
import Scene from './components/Scene'

function App() {
  return (
    <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Loading…</div>}>
      <Scene />
    </Suspense>
  )
}

export default App
