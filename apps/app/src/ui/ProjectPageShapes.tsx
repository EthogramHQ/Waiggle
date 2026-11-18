// Les formes vides du bas de la page d'un projet (R16, « Les squelettes », planches R16-Projet-1440
// et 390) : ce que l'aperçu tiré d'une carte ne sait pas encore (les actions, la description, le
// prompt, la recette, les commentaires), à la place et à la hauteur de ce qui arrive. Elles vivent
// ici, dans `src/ui`, parce qu'elles lisent les jetons (hauteurs des boutons) : la page d'un projet
// (projects/ProjectPage.tsx, `ProjectPageSkeleton`) ne fait que les assembler selon la largeur.
// Aucune n'a de rôle ni de nom : c'est le `Loading` de la page qui dit « Chargement… », une fois.
import { layout } from '@ruche/brand'
import type { ReactNode } from 'react'
import { ListRowSkeleton, TextLineShape } from './ListGroup'
import { Shape } from './Skeleton'
import { Stack } from './Stack'
import { Surface } from './Surface'

/**
 * « Tester la démo » (le grand bouton), l'adresse de la démo, puis les deux actions plus discrètes
 * (« Suivre ce projet », « Rejoindre les testeurs »). `wide` : sur ordinateur, à côté de la galerie,
 * le grand bouton ne prend pas toute la colonne (planche R16-Projet-1440).
 */
export function ActionsShapes({ wide }: { wide: boolean }): ReactNode {
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Shape height={layout.controlHeight.regular} width={wide ? '80%' : '100%'} round />
        <TextLineShape variant="caption" width="55%" />
      </Stack>
      <Stack gap="sm">
        <Shape height={layout.controlHeight.small} width={wide ? '40%' : '60%'} round />
        <Shape height={layout.controlHeight.small} width={wide ? '45%' : '65%'} round />
      </Stack>
    </Stack>
  )
}

/** « Description » (son titre) et trois lignes de texte, comme `ProjectDescription`. */
export function DescriptionShapes(): ReactNode {
  return (
    <Stack gap="md">
      <TextLineShape variant="heading" width="35%" />
      <Stack gap="none">
        <TextLineShape variant="body" width="95%" />
        <TextLineShape variant="body" width="90%" />
        <TextLineShape variant="body" width="60%" />
      </Stack>
    </Stack>
  )
}

/** Le bloc du prompt de départ : son titre, puis quelques lignes dans un bloc. */
export function PromptShapes(): ReactNode {
  return (
    <Surface variant="grouped" padding="lg" gap="sm">
      <TextLineShape variant="callout" width="40%" />
      <Stack gap="none">
        <TextLineShape variant="code" width="90%" />
        <TextLineShape variant="code" width="85%" />
        <TextLineShape variant="code" width="50%" />
      </Stack>
    </Surface>
  )
}

/** « La recette », dans sa surface : son titre et trois lignes (outils, difficulté, début). */
export function RecipeShapes(): ReactNode {
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <TextLineShape variant="heading" width="45%" />
      <Stack gap="sm">
        <TextLineShape variant="callout" width="75%" />
        <TextLineShape variant="callout" width="85%" />
        <TextLineShape variant="callout" width="60%" />
      </Stack>
    </Surface>
  )
}

/** Les commentaires, dans leur surface : le titre de la section et trois lignes vides. */
export function CommentsShapes(): ReactNode {
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <TextLineShape variant="heading" width="50%" />
      <CommentRowsSkeleton />
    </Surface>
  )
}

/** Les lignes vides des commentaires (la photo, le nom, le texte), le nombre de l'aperçu. */
const COMMENT_ROWS = 3

/**
 * Les lignes vides d'une liste de commentaires qui charge, sans `Loading` autour : la page les pose
 * dans son squelette (`CommentsShapes`), et la section des commentaires
 * (screens/ProjectComments.tsx) dans le sien.
 */
export function CommentRowsSkeleton(): ReactNode {
  return (
    <Stack gap="xs">
      {Array.from({ length: COMMENT_ROWS }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
        <ListRowSkeleton key={index} />
      ))}
    </Stack>
  )
}
