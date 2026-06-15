import { useTelemetryStore } from '../../store/telemetryStore'

export default function Tachometer() {
  const rpm = useTelemetryStore((s) => s.rpm)
  const isDrifting = useTelemetryStore((s) => s.isDrifting)

  const pct = Math.min(rpm / 7000, 1)
  const barHeight = pct * 100
  const showShiftLight = rpm > 6500

  return (
    <div className={`hud-panel tachometer ${isDrifting ? 'tachometer-drifting' : ''}`}>
      <div className="tachometer-bar-track">
        <div
          className="tachometer-bar-fill"
          style={{ height: `${barHeight}%` }}
        />
        {showShiftLight && <div className="tachometer-shift-light" />}
      </div>
      <span className="tachometer-label">RPM</span>
      <span className="tachometer-value">{Math.round(rpm)}</span>
    </div>
  )
}