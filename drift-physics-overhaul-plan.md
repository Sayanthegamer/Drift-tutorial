# Drift Tutorial — Physics & Core Logic Overhaul Plan

## 0. How to Use This Document

You are working in a Vite + React 19 + @react-three/fiber + @react-three/rapier
project (a top-down/chase-cam drift racing prototype). The codebase compiles
and runs, but the vehicle physics and drivetrain logic are placeholder-grade —
your job is to bring them up to a believable, tunable, non-jittery standard
**without breaking the existing build or component contracts**.

Work through the phases **in order**. Each phase is independently shippable —
after every phase, run:

```bash
npm run build   # tsc --noEmit equivalent + vite build, must pass with 0 errors
npm run dev     # manual smoke test in browser
```

Do not start a later phase until the current one builds cleanly and passes the
manual checks in §5.

All new tunable numbers (forces, ratios, thresholds, coefficients) MUST live in
the new `src/physics/VehicleConfig.ts` file described in §4 — no new magic
numbers scattered across components.

---

## 1. Project Snapshot (for context)

- **Car controller**: `src/components/Car.tsx` — owns the Rapier
  `DynamicRayCastVehicleController`, runs the per-frame physics/telemetry loop.
- **Tire model**: `src/physics/TireModel.ts` — simplified Pacejka lateral
  force formula. Currently computed but **not actually applied** to the body.
- **Drift physics**: `src/physics/DriftPhysics.ts` — per-wheel slip
  computation; result is only used to set `frictionSlip` /
  `sideFrictionStiffness` on the Rapier controller.
- **Assists**: `src/physics/AssistsManager.ts` — counter-steer + a
  `computeStabilityTorque` function that is **exported but never called**.
- **Drift detection**: `src/physics/DriftDetectionSystem.ts` — binary
  isDrifting flag from slip angle + yaw rate, no hysteresis.
- **Stores**: `telemetryStore` (HUD speed/rpm/gear/slip/drift),
  `visualEffectsStore` (wheel world positions/slip for smoke + skid marks),
  `gameStore` (mode + drift score + unused game state machine), `inputStore`.
- **HUD**: `src/components/ui/*` reads from `telemetryStore` /
  `gameStore` only — do not change these public shapes unless a phase says so.

---

## 2. Diagnosis: Why It Feels Like a "Shitbox"

1. **The Pacejka tire model is decorative.** `computeLateralForce()` in
   `TireModel.ts` is called inside `DriftPhysics.ts`, but its result
   (`lateralForce`) is only used to derive a `lateralRatio` → `gripMultiplier`
   → `effectiveSlip`/`sideFrictionStiffness`. No actual force or impulse from
   the tire model is ever applied to the chassis. The car's lateral behavior
   is entirely Rapier's internal vehicle-controller friction model, tuned
   indirectly through a number that was *derived* from a force that's
   otherwise discarded.

2. **Binary grip switch causes snapping.** `isGripping = gripMultiplier > 0.3`
   is a hard boolean that flips `sideFrictionStiffness` between `1.0` and
   `0.3` instantly (`DriftPhysics.ts`, near the bottom of the wheel loop).
   This is a discontinuity — the car will "catch" or "let go" of grip in a
   single frame, which reads as snapping/teleporting rather than a smooth
   slide.

3. **Stability assist is dead code.** `AssistsManager.ts` exports
   `computeStabilityTorque()`, which is designed to dampen roll, but
   `Car.tsx` never imports or calls it. Nothing currently prevents the
   chassis from rolling/flipping during hard drifts.

4. **No drag or rolling resistance anywhere.** `ENGINE_FORCE = 800` is a
   constant force applied every frame the throttle is held, with nothing
   opposing it except tire friction. There is no terminal velocity — the car
   will accelerate indefinitely (until floating-point or Rapier solver limits
   kick in). `RigidBody` in `Car.tsx` doesn't set `linearDamping` either.

5. **RPM/gear is fake.** In `Car.tsx`:
   ```ts
   const wheelAngVel = Math.abs(rearLongVel) / WHEEL_RADIUS
   let rpm = wheelAngVel / (2 * Math.PI) * 60
   rpm = Math.max(800, Math.min(7000, rpm))
   ```
   RPM is just wheel speed rescaled and clamped — there's no gear ratio, no
   final drive, no torque curve. The subsequent `gear` selection
   (`ratio = speedKmh / (rpm + 1) * 1000`) is therefore just speed buckets
   wearing a gearbox costume. Engine force is also constant regardless of
   RPM/gear, so there's no "power band" feel.

6. **Drift detection flickers.** `DriftDetectionSystem.ts` uses a single
   threshold (`DRIFT_ANGLE_THRESHOLD = 0.15`, `MIN_YAW_RATE = 0.1`) with no
   hysteresis or minimum-duration debounce. Right at the boundary, smoke,
   skid marks, score accumulation, and HUD "DRIFTING" badges will all
   flicker on/off every frame.

7. **Handbrake is a one-shot kick, not a continuous force.** The handbrake
   impulse in `DriftPhysics.ts` fires once per "handbrake held" transition
   region (effectively every frame it's true, since there's no edge
   detection), capped at 300 — combined with #2's snapping grip, this
   produces an unpredictable rear-end kick rather than a controllable slide.

8. **Type duplication.** `Car.tsx` declares its own local `WheelConfig`
   interface, identical to the one exported from `DriftPhysics.ts` /
   `physics/index.ts`. They can silently drift apart.

9. **Suspension constants look untuned for the car's mass.** `mass={150}`
   (≈1471N total weight) with `setWheelSuspensionStiffness(i, 50)`,
   compression `8`, relaxation `10`, max travel `0.5`, max force `10000` —
   these damping-ratio-style numbers are far outside typical Bullet/Rapier
   raycast-vehicle ranges (stiffness ~5–10, damping ~0.3–1.0) and likely
   produce an overly rigid, possibly jittery suspension.

10. **Unused dead code**: `src/components/TestGround.tsx` is never imported
    anywhere (Scene.tsx uses `Track`, not `TestGround`). `gameStore`'s
    `gameState` / `setGameState` / `resetDriftScore` are never called from
    anywhere — the "menu/playing/gameover" state machine doesn't exist in
    practice.

---

## 3. Execution Plan

### Phase 1 — Stabilization & Bug Fixes (do this first, lowest risk)

**1.1 — Smooth out grip transitions in `DriftPhysics.ts`**
- Remove the binary `isGripping` → `sideFrictionStiffness` switch
  (`1.0` / `0.3`).
- Instead, compute `sideFrictionStiffness` as a continuous function of
  `gripMultiplier`, e.g. `lerp(0.3, 1.0, gripMultiplier)`.
- Additionally, low-pass filter `effectiveSlip` and
  `sideFrictionStiffness` across frames (store previous value per wheel,
  e.g. in a `useRef<number[]>` in `Car.tsx`, passed into
  `updateDriftPhysics`, and blend: `value = lerp(prev, target, 1 - exp(-dt / tau))`
  with `tau ≈ 0.08–0.15s`). This removes single-frame snapping while keeping
  responsiveness.
- `isGripping` (boolean) can remain in `WheelDriftData` for telemetry/visual
  purposes (e.g. smoke triggers), but it must no longer directly drive a
  hard-switched physics parameter.

**1.2 — Wire up the stability assist**
- In `Car.tsx`, after computing `driftResult` and before/after
  `controller.updateVehicle(delta)`, call
  `computeStabilityTorque(rotation, angvel, assistParams, delta)` from
  `AssistsManager.ts` (already exported via `physics/index.ts`).
- Convert the returned `Vec3` torque into a Rapier vector
  (`createRapierVector(rapier, t.x, t.y, t.z)`, reusing the existing helper)
  and apply it with `chassis.applyTorqueImpulse(torqueVec, true)`.
- Verify `ROOKIE_PARAMS.stabilityFactor = 0.5` actually reduces roll during
  handbrake turns, and `ADVANCED_PARAMS.stabilityFactor = 0` leaves the car
  free to roll more (advanced players get less assistance).

**1.3 — Add resistance forces (drag + rolling resistance)**
- New function in `src/physics/Resistance.ts` (new file, exported via
  `physics/index.ts`):
  ```ts
  export interface ResistanceParams {
    dragCoefficient: number   // quadratic, opposes v^2
    rollingResistance: number // linear, opposes v
  }

  export function computeResistanceForce(
    velocity: Vec3,
    params: ResistanceParams,
  ): Vec3 {
    const speed = magnitude(velocity)
    if (speed < 1e-4) return { x: 0, y: 0, z: 0 }
    const dir = normalize(velocity)
    const dragMag = params.dragCoefficient * speed * speed
    const rrMag = params.rollingResistance * speed
    return scale(dir, -(dragMag + rrMag))
  }
  ```
- In `Car.tsx`'s `useFrame`, after computing `linvel`, call this and apply as
  an impulse: `chassis.applyImpulse(scale(resistanceForce, delta), true)`.
- Tune `dragCoefficient` / `rollingResistance` (in `VehicleConfig.ts`, see
  §4) so that under constant max throttle the car settles at a believable top
  speed (suggested target: ~140–160 km/h on the straights of `Track.tsx`).
  Iterate empirically — there is no single "correct" number here.

**1.4 — Deduplicate `WheelConfig`**
- Remove the local `interface WheelConfig` in `Car.tsx`.
- Import `WheelConfig` from `../physics` (already exported via
  `physics/index.ts` from `DriftPhysics.ts`) and use that for
  `WHEEL_CONFIGS: WheelConfig[]`.

**1.5 — Add hysteresis + debounce to `DriftDetectionSystem.ts`**
- Replace the single `DRIFT_ANGLE_THRESHOLD` with an enter/exit pair:
  - `DRIFT_ENTER_ANGLE = 0.18` rad (~10.3°)
  - `DRIFT_EXIT_ANGLE = 0.10` rad (~5.7°)
- State transition logic:
  - If not drifting and `avgRearSlip > DRIFT_ENTER_ANGLE && yawRate > MIN_YAW_RATE`
    → start drifting.
  - If drifting and `avgRearSlip < DRIFT_EXIT_ANGLE` → stop drifting (only
    after a minimum drift duration, e.g. 0.15s, to avoid 1-frame blips —
    track elapsed time since `isDrifting` became true and ignore exit
    conditions until that minimum is reached).
- Keep the rest of the scoring logic (`driftScore` accumulation) as-is for
  now — scoring tuning is Phase 4.

---

### Phase 2 — Drivetrain Model (gears, RPM, torque curve)

**2.1 — New module `src/physics/Drivetrain.ts`** (export via `physics/index.ts`):

```ts
export interface DrivetrainConfig {
  gearRatios: number[]      // index 0 = 1st gear
  reverseRatio: number
  finalDrive: number
  idleRpm: number
  redlineRpm: number
  shiftUpRpm: number         // upshift trigger
  shiftDownRpm: number        // downshift trigger
  shiftCooldownSec: number    // min time between shifts
}

export interface DrivetrainState {
  gearIndex: number   // -1 = reverse, 0 = neutral, 1..N = forward gears
  rpm: number
  timeSinceShift: number
}

export interface DrivetrainResult extends DrivetrainState {
  gearLabel: string          // 'R' | 'N' | '1'..'N'
  engineForceAtWheel: number // N, signed by drive direction
}

export function updateDrivetrain(
  wheelAngularVelocity: number, // rad/s, sign-aware (rear wheel avg)
  throttleInput: number,        // -1..1 (reverse..forward)
  prevState: DrivetrainState,
  config: DrivetrainConfig,
  wheelRadius: number,
  dt: number,
): DrivetrainResult { /* ... */ }
```

- **RPM formula**: for the *current* gear,
  `rpm = clamp(|wheelAngularVelocity| * |gearRatios[gear]| * finalDrive * 60 / (2π), idleRpm, redlineRpm)`.
- **Auto-shift state machine**:
  - `timeSinceShift += dt` every frame; reset to 0 on any shift.
  - If `rpm >= shiftUpRpm && gearIndex < gearRatios.length && timeSinceShift >= shiftCooldownSec`
    → `gearIndex += 1`.
  - If `rpm <= shiftDownRpm && gearIndex > 1 && timeSinceShift >= shiftCooldownSec`
    → `gearIndex -= 1`.
  - Neutral (`gearIndex === 0`) only when stationary and no throttle; reverse
    (`gearIndex === -1`) when `throttleInput < 0` and speed is near zero.
- **Torque curve → engine force**: define a simple piecewise-linear torque
  curve (Nm) over `[idleRpm, redlineRpm]`, e.g. ramps up to a peak around
  60–70% of redline then falls off toward redline. Convert to wheel force:
  `engineForceAtWheel = (torque(rpm) * |gearRatios[gear]| * finalDrive / wheelRadius) * sign(throttleInput)`.
  This **replaces** the constant `ENGINE_FORCE = 800` currently set in
  `Car.tsx`.

**2.2 — Wire into `Car.tsx`**
- Remove `ENGINE_FORCE` constant and the `if (input.forward) engineForce = ENGINE_FORCE...`
  block.
- Call `updateDrivetrain(...)` once per frame using the **previous frame's**
  rear-wheel longitudinal velocity (you already compute
  `driftResult.wheelData[2/3].longitudinalVelocity` — use last frame's value
  or restructure so drivetrain runs after `updateDriftPhysics`, whichever is
  cleaner) to get `engineForceAtWheel` and `gearLabel`/`rpm`.
- Feed `engineForceAtWheel` into the existing `engineForce` variable used by
  `updateDriftPhysics` and `controller.setWheelEngineForce(2/3, engineForce)`.
- Publish `rpm` and `gearLabel` to `telemetryStore` instead of the old
  hand-rolled values — **keep the `TelemetryData` shape unchanged**
  (`speedKmh, rpm, gear, slipAngleDeg, isDrifting`), so `Tachometer.tsx` and
  `GearIndicator.tsx` need no changes.

**2.3 — Suggested starting numbers** (put in `VehicleConfig.ts`, tune from
here): `gearRatios = [3.6, 2.4, 1.8, 1.4, 1.1, 0.9]`, `reverseRatio = -3.2`,
`finalDrive = 3.7`, `idleRpm = 900`, `redlineRpm = 7200`,
`shiftUpRpm = 6800`, `shiftDownRpm = 2500`, `shiftCooldownSec = 0.35`.

---

### Phase 3 — Calibration Pass

This phase has **no new code**, only number tuning, but it's load-bearing —
do it after Phases 1 and 2 since they change the dynamics you're tuning.

3.1 — **Suspension**: re-tune `setWheelSuspensionStiffness/Compression/Relaxation`
(currently `50/8/10`) toward more conventional raycast-vehicle ranges
(roughly stiffness `8–15`, compression `0.6–2`, relaxation `0.8–3`). Test for:
no visible jitter at rest, body settles without excessive bounce after a jump
on the track's elevation changes (there are none currently, but suspension
should still feel damped when landing from e.g. a curb hit).

3.2 — **Mass vs. forces**: with the Phase 2 torque curve in place, verify
0–100 km/h acceleration feels reasonable for an arcade drift car (~3–5s).
Adjust `mass` (currently 150kg — consider raising to something in the
800–1400kg range for a "car" rather than a kart) and/or the torque curve
peak together; don't change one without re-checking the other.

3.3 — **Effective μ per mode**: `ROOKIE_PARAMS.effectiveMu = 1.15`,
`ADVANCED_PARAMS.effectiveMu = 0.95` (in `AssistsManager.ts`). After Phases 1
and 2, re-validate that Rookie mode is meaningfully easier to hold a drift in
than Advanced, and that Advanced allows full lockup/slide on handbrake.

3.4 — **Handbrake force**: `HANDBRAKE_FORCE = 300` (brake torque) and the
impulse magnitude cap (`300` in `DriftPhysics.ts`) should be revisited
together with the new smoothing from 1.1 — confirm the handbrake produces a
controllable rotation rather than either no effect or an instant spin.

---

### Phase 4 — Drift Scoring & Game State Polish

4.1 — **Score scaling**: currently
`driftScore += yawRate * avgRearSlip * SCORE_ACCUMULATION_RATE * dt`
(`DriftDetectionSystem.ts`). Consider multiplying by a speed factor (e.g.
`clamp(speedKmh / 50, 0.5, 2.0)`) so low-speed wiggling scores less than a
committed high-speed drift. Keep this as a single, clearly-named constant in
`VehicleConfig.ts` if added.

4.2 — **Game state machine**: `gameStore.ts` defines `gameState:
'menu'|'playing'|'paused'|'gameover'` and `setGameState`/`resetDriftScore`,
but nothing calls them. Either:
  - (a) Wire up a minimal flow — e.g. `setGameState('playing')` on first
    input, and call `resetDriftScore()` when transitioning into `'playing'`
    from `'menu'`/`'gameover'` — or
  - (b) explicitly leave as out-of-scope and note it in your summary so it's
    clear this is intentionally untouched, not forgotten.
  Do not silently leave half-wired state; pick (a) or (b) and document which.

4.3 — **Dead code cleanup**: delete `src/components/TestGround.tsx` (unused,
superseded by `Track.tsx`) unless you have a reason to keep it as a debug
scene — if keeping it, add a comment explaining it's intentionally unused
debug-only code.

---

### Phase 5 — Advanced Tire Model (optional / stretch goal)

Only attempt this after Phases 1–4 are complete, building, and feel
reasonable. This is higher-risk and may require empirical iteration against
the real `@dimforge/rapier3d-compat` `DynamicRayCastVehicleController`
behavior (consult its source/docs for exact semantics of `frictionSlip` and
`sideFrictionStiffness` before changing this).

Goal: make `computeLateralForce()` (Pacejka) actually *the* source of lateral
grip, rather than an input to a derived friction-slip number.

Suggested approach:
- Drive `sideFrictionStiffness` down toward a low baseline (empirically
  determine — likely in the `0.05–0.2` range) so Rapier's internal lateral
  correction is minimized but not fully zero (fully zero may cause
  instability).
- Each frame, for each wheel in contact, apply the Pacejka-computed
  `lateralForce` directly as an impulse at the wheel's world contact point:
  `chassis.applyImpulseAtPoint(scale(wheelRight, lateralForce * delta), wheelContactWorldPos, true)`.
  You'll need the wheel's world contact point — derive it from chassis
  position + rotated connection point, minus suspension length along the
  wheel's down axis (similar math already exists in `Car.tsx`'s visual wheel
  sync loop).
- Combined-slip: scale both the Pacejka lateral force *and* the drivetrain's
  longitudinal engine force by a shared friction-circle factor based on total
  slip (longitudinal + lateral), rather than the current one-directional
  ellipse factor.
- If this phase makes the car harder to control or introduces oscillation,
  revert to the Phase 1 smoothed friction-slip approach — it is a legitimate
  fallback, not just a stopgap.

---

## 4. New Config File: `src/physics/VehicleConfig.ts`

Create this file as the single source of truth for all tunables introduced or
touched above. Export a single `VEHICLE_CONFIG` object (or several grouped
consts) and import it from `Car.tsx`, `DriftPhysics.ts`, `Drivetrain.ts`,
`Resistance.ts`, and `DriftDetectionSystem.ts` as needed. Re-export it from
`physics/index.ts`. Suggested shape:

```ts
export const VEHICLE_CONFIG = {
  mass: 150,              // revisit in Phase 3
  wheelRadius: 0.3,

  suspension: {
    stiffness: 50,        // revisit in Phase 3
    compression: 8,
    relaxation: 10,
    maxTravel: 0.5,
    maxForce: 10000,
  },

  resistance: {
    dragCoefficient: 0.4,     // tune in Phase 1.3
    rollingResistance: 8.0,   // tune in Phase 1.3
  },

  drivetrain: {
    gearRatios: [3.6, 2.4, 1.8, 1.4, 1.1, 0.9],
    reverseRatio: -3.2,
    finalDrive: 3.7,
    idleRpm: 900,
    redlineRpm: 7200,
    shiftUpRpm: 6800,
    shiftDownRpm: 2500,
    shiftCooldownSec: 0.35,
  },

  drift: {
    enterAngleRad: 0.18,
    exitAngleRad: 0.10,
    minYawRate: 0.1,
    minDriftDurationSec: 0.15,
    scoreAccumulationRate: 1.0,
  },

  smoothing: {
    frictionSlipTauSec: 0.1,
    sideFrictionTauSec: 0.1,
  },
} as const
```

Existing constants currently hardcoded at the top of `Car.tsx`
(`ENGINE_FORCE`, `MAX_BRAKE_FORCE`, `HANDBRAKE_FORCE`, `MAX_STEER`,
`BODY_WIDTH/HEIGHT/LENGTH`, `AXLE_OFFSET`, `WHEEL_RADIUS`,
`WHEEL_HEIGHT`) and in `DriftPhysics.ts`
(`MIN_SPEED_THRESHOLD`, `BASE_FRICTION_SLIP`, `SLIP_NEAR_ZERO`,
`MAX_LONG_FORCE`) should be migrated into `VEHICLE_CONFIG` where they
overlap with the above groups (geometry constants like `BODY_WIDTH` can stay
local if purely cosmetic — use judgment, but anything that affects *feel/tuning*
belongs in the config).

---

## 5. Verification Protocol

After each phase, in addition to `npm run build`, manually test in the
browser (`npm run dev`) for:

- **No build/type errors**, no new `any` beyond what already exists for
  untyped Rapier internals.
- **Straight-line test**: hold W on a straight section of `Track.tsx` — speed
  should accelerate, gear should step 1→2→3... plausibly with RPM rising and
  falling at each shift, and speed should converge to a stable top speed
  (not climb forever).
- **Drift test**: enter a corner with handbrake — car should rotate smoothly
  into a slide without snapping/teleporting, HUD's slip angle gauge and
  "DRIFTING" badge should not flicker on/off rapidly, smoke/skid marks should
  appear continuously during the slide.
- **Roll test**: aggressive handbrake turns at speed should not flip the car
  onto its roof (Phase 1.2's stability torque should visibly resist this in
  Rookie mode at least).
- **Reverse/neutral**: holding S from a standstill should engage reverse gear
  ('R' on HUD) and move the car backward; releasing both pedals at standstill
  should settle to 'N'.

---

## 6. Constraints / Do Not Touch

- Do not change the public shape of `TelemetryData`, `VisualEffectsData`,
  `GameStore`, or `InputStore` unless a phase explicitly says to (Phase 4.2
  is the only sanctioned `gameStore` change, and even that is optional/(a)).
- Do not change `Scene.tsx`, `Lighting.tsx`, `Effects.tsx`, `Track.tsx`,
  `TireSmoke.tsx`, `SkidMarks.tsx`, or any `src/components/ui/*` component
  unless a bug in this plan turns out to require it — if so, call it out
  explicitly in your summary rather than changing it silently.
- Keep TypeScript `strict` mode passing (`tsconfig.json` has `"strict": true`).
- Keep all new physics tunables centralized in `VehicleConfig.ts` per §4.

---

## 7. Definition of Done

- All five phases (Phase 5 may be explicitly deferred/skipped with a written
  rationale) are implemented or consciously deferred.
- `npm run build` passes with zero errors/warnings introduced.
- A short summary is provided per phase: what changed, which files, and the
  result of the manual tests in §5.
- `VehicleConfig.ts` exists and is the single source for tunable constants
  introduced or migrated in this plan.
