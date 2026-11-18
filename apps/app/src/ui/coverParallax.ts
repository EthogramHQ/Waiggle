// La photo d'un projet qui défile moins vite que la page (R17, scénario « La photo d'un projet qui
// défile moins vite ») : le décalage et l'agrandissement de la photo pour un défilement donné. Une
// fonction pure, sans React : les composants (ui/PhotoGallery, ui/ProjectCover) l'appliquent.

/** Ce que reçoit la photo : un décalage vers le bas et un agrandissement (1 = sa taille). */
export type CoverShift = { translateY: number; scale: number }

/**
 * Le décalage de la photo quand la page a défilé de `y` points (négatif : on tire plus haut que le
 * haut de la page). `calm` : « Réduire les animations » est activé, la photo reste à sa place.
 */
export const coverParallax = (_y: number, _calm: boolean): CoverShift => ({
  translateY: 0,
  scale: 1,
})
