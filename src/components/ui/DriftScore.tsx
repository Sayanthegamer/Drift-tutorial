import { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useTelemetryStore } from '../../store/telemetryStore'

export default function DriftScore() {
  const driftScore = useGameStore((s) => s.driftScore)
  const isDrifting = useTelemetryStore((s) => s.isDrifting)
  const displayRef = useRef(0)
  const rafRef = useRef<number>(0)

  // Animate numeric display smoothly toward target
  useEffect(() => {
    const target = driftScore
    const animate = () => {
      const current = displayRef.current
      const diff = target - current
      if (Math.abs(diff) < 1) {
        displayRef.current = target
      } else {
        displayRef.current += diff * 0.1
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [driftScore])

  const formatted = Math.floor(displayRef.current).toLocaleString()

  return (
    <div className={`hud-panel drift-score ${isDrifting ? 'drift-score-active' : ''}`}>
      {isDrifting && <div className="drift-score-badge">DRIFTING</div>}
      <div className="drift-score-value">{formatted}</div>
      <div className="drift-score-label">SCORE</div>
    </div>
  )
}