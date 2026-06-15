import Speedometer from './Speedometer'
import Tachometer from './Tachometer'
import GearIndicator from './GearIndicator'
import SlipAngleGauge from './SlipAngleGauge'
import DriftScore from './DriftScore'

export default function HUD() {
  return (
    <div className="hud-overlay">
      <div className="hud-top-left">
        <GearIndicator />
      </div>
      <div className="hud-top-right">
        <Speedometer />
      </div>
      <div className="hud-right">
        <Tachometer />
      </div>
      <div className="hud-bottom-right">
        <SlipAngleGauge />
      </div>
      <div className="hud-bottom-left">
        <DriftScore />
      </div>
    </div>
  )
}