import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

export default function Effects() {
  return (
    <EffectComposer multisampling={4}>
      {/* Bloom / glow */}
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.4}
        luminanceSmoothing={0.08}
        mipmapBlur
      />
      {/* Subtle vignette for atmosphere */}
      <Vignette
        offset={0.3}
        darkness={0.5}
      />
    </EffectComposer>
  )
}
