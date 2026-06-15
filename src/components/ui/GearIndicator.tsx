import { useTelemetryStore } from '../../store/telemetryStore'

export default function GearIndicator() {
  const gear = useTelemetryStore((s) => s.gear)
  const isDrifting = useTelemetryStore((s) => s.isDrifting)

  const isReverse = gear === 'R'
  const isNeutral = gear === 'N'

  return (
    <div className={`hud-panel gear-indicator ${isDrifting ? 'gear-drifting' : ''}`}>
      <span
        className={`gear-value ${isReverse ? 'gear-reverse' : ''} ${isNeutral ? 'gear-neutral' : ''}`}
      >
        {gear}
      </span>
    </div>
  )
}