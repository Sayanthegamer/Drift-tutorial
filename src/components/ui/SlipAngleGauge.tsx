import { useTelemetryStore } from '../../store/telemetryStore'

export default function SlipAngleGauge() {
  const slipAngleDeg = useTelemetryStore((s) => s.slipAngleDeg)
  const isDrifting = useTelemetryStore((s) => s.isDrifting)

  const clamped = Math.min(Math.abs(slipAngleDeg), 45)
  const pct = clamped / 45

  // Color transitions: green (0-10°) -> yellow (10-25°) -> red (25-45°)
  let color = '#4caf50'
  if (clamped > 25) {
    color = '#e53935'
  } else if (clamped > 10) {
    color = '#ffab00'
  }

  return (
    <div className={`hud-panel slip-angle-gauge ${isDrifting ? 'slip-angle-drifting' : ''}`}>
      <div className="slip-angle-label">SLIP</div>
      <svg viewBox="0 0 120 70" className="slip-angle-svg">
        {/* Background arc */}
        <path
          d="M 10 65 A 55 55 0 0 1 110 65"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 10 65 A 55 55 0 0 1 110 65"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${pct * 157} 157`}
          style={{ transition: 'stroke-dasharray 0.05s linear, stroke 0.15s ease' }}
        />
        {/* Tick marks */}
        {[0, 10, 20, 30, 45].map((deg) => {
          const ratio = deg / 45
          const angle = Math.PI - ratio * Math.PI
          const x = 60 + 50 * Math.cos(angle)
          const y = 65 - 50 * Math.sin(angle)
          return (
            <g key={deg}>
              <line
                x1={60 + 44 * Math.cos(angle)}
                y1={65 - 44 * Math.sin(angle)}
                x2={60 + 50 * Math.cos(angle)}
                y2={65 - 50 * Math.sin(angle)}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1.5"
              />
              <text
                x={60 + 58 * Math.cos(angle)}
                y={65 - 58 * Math.sin(angle) + 3}
                fill="rgba(255,255,255,0.4)"
                fontSize="8"
                textAnchor="middle"
              >
                {deg}
              </text>
            </g>
          )
        })}
        {/* Value text */}
        <text
          x="60"
          y="48"
          textAnchor="middle"
          fill={color}
          fontSize="18"
          fontWeight="bold"
          fontFamily="'Courier New', monospace"
        >
          {clamped.toFixed(1)}°
        </text>
      </svg>
    </div>
  )
}