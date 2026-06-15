import { useTelemetryStore } from '../../store/telemetryStore'

export default function Speedometer() {
  const speedKmh = useTelemetryStore((s) => s.speedKmh)

  return (
    <div className="hud-panel speedometer">
      <span className="speedometer-value">{Math.round(speedKmh)}</span>
      <span className="speedometer-unit">km/h</span>
    </div>
  )
}