// La photo d'un projet qui défile moins vite que la page (R17, scénario « La photo d'un projet qui
// défile moins vite ») : le décalage et l'agrandissement de la photo pour un défilement donné. Une
// fonction pure, sans React : l'enveloppe ui/CoverParallax.tsx l'applique à la photo de la galerie.
//
// Pourquoi « décalée vers le bas » : la page monte sous le doigt de `y` points, le cadre de la photo
// avec elle ; la photo, poussée vers le bas de 45 % de `y` dans son cadre qui rogne, ne monte donc
// qu'à 55 % de la vitesse du doigt. La page (la feuille, le texte) la recouvre peu à peu.
import { parallax } from '@ruche/brand'

/** Ce que reçoit la photo : un décalage vers le bas et un agrandissement (1 = sa taille). */
export type CoverShift = { translateY: number; scale: number }

/**
 * Le décalage de la photo quand la page a défilé de `y` points (négatif : on tire plus haut que le
 * haut de la page). `calm` : « Réduire les animations » est activé, la photo reste à sa place.
 */
export const coverParallax = (y: number, calm: boolean): CoverShift => {
  // « worklet » : la fonction peut aussi tourner sur le fil des animations de Reanimated (le
  // téléphone y calcule le style de la photo à chaque image, sans repasser par JavaScript).
  'worklet'
  if (calm) return { translateY: 0, scale: 1 }
  return {
    // Vers le bas seulement : tirer plus haut que le haut ne fait pas monter la photo.
    translateY: Math.max(0, y) * parallax.rate,
    // Tirée vers le bas, la photo grandit de 1 % tous les 6 points ; à sa taille sinon.
    scale: y < 0 ? 1 + (-y / parallax.stretchPer) * parallax.stretchStep : 1,
  }
}
