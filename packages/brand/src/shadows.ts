// Les ombres, écrites comme en CSS : décalage horizontal, vertical, flou, couleur.
// Le jour, elles sont teintées de miel (jamais grises) : un objet posé sur du blanc projette une
// ombre chaude. La nuit, elles sont noires, et le miel devient un halo.
// React Native (iOS, Android) et le web comprennent tous ce format (propriété `boxShadow`).
import type { Scheme } from './colors'

const day = {
  soft: '0 4px 14px rgba(110,70,0,0.06)', // groupes de champs
  float: '0 12px 32px rgba(110,70,0,0.14)', // ce qui flotte : barres, boutons ronds
  card: '0 18px 40px rgba(90,40,10,0.18)', // cartes immersives
  honey: '0 10px 24px rgba(199,127,0,0.28)', // halo du bouton miel
  // Reflet : un trait de lumière en haut du verre et des boutons, à l'intérieur (« inset »)
  highlight: 'inset 0 1px 0 rgba(255,255,255,0.9)',
}

const night = {
  soft: '0 4px 14px rgba(0,0,0,0.35)',
  float: '0 12px 32px rgba(0,0,0,0.45)',
  card: '0 18px 40px rgba(0,0,0,0.5)',
  honey: '0 10px 24px rgba(255,201,51,0.18)',
  highlight: 'inset 0 1px 0 rgba(255,255,255,0.06)',
} satisfies Record<keyof typeof day, string>

export type ShadowName = keyof typeof day
export const shadows: Record<Scheme, Record<ShadowName, string>> = { day, night }
