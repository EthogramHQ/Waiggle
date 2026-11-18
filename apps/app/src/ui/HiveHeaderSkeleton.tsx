// Le haut vide de la page d'une ruche (R16, « La page ne bouge plus en arrivant » ; relecture de
// l'interface R16, A1) : l'alvéole, le nom et la ligne des membres, aux places du vrai en-tête, et
// les titres vides de ses colonnes sur ordinateur. Avant, l'écran dessinait ces pièces lui-même, avec
// des mesures recopiées : un changement de l'en-tête ne les aurait pas suivies, et la page aurait
// sauté de nouveau à l'arrivée sans qu'aucun test ne rougisse.
//
// Sans rôle ni nom : c'est le `Loading` de la page qui dit « Chargement… », une seule fois.
import { layout } from '@ruche/brand'
import type { ReactNode } from 'react'
import { TextLineShape } from './ListGroup'
import { Shape } from './Skeleton'
import { Row, Stack } from './Stack'

/**
 * La taille de l'alvéole en haut de la page d'une ruche (la grande des trois de `HiveBadge`). Le vrai
 * en-tête la lit aussi : la place vide et l'alvéole ont toujours la même taille.
 */
export const HIVE_HEADER_BADGE_SIZE = layout.hive.large

/** Les longueurs des lignes vides : le nom (« Famille ») et le nombre de membres. */
const NAME_WIDTH = '45%'
const COUNT_WIDTH = '30%'

/**
 * Le haut vide : l'alvéole (un bloc de sa taille), puis le nom (une ligne au style du titre de la
 * page, `title1`) et le nombre de membres (`callout`), empilés comme dans le vrai en-tête.
 */
export function HiveHeaderSkeleton(): ReactNode {
  return (
    <Row gap="md" align="center">
      <Shape height={HIVE_HEADER_BADGE_SIZE} width={HIVE_HEADER_BADGE_SIZE} />
      <Stack gap="xxs" grow>
        <TextLineShape variant="title1" width={NAME_WIDTH} />
        <TextLineShape variant="callout" width={COUNT_WIDTH} />
      </Stack>
    </Row>
  )
}

/**
 * Le titre vide d'une colonne de la page sur ordinateur, à la hauteur du vrai : `members`, le titre
 * « Membres » de la colonne de gauche (`headline`) ; `testers`, le titre du groupe des projets à
 * tester à droite (« Papi Jean cherche des testeurs », la légende d'un `ListGroup`).
 */
export function HiveColumnTitleSkeleton({ column }: { column: 'members' | 'testers' }): ReactNode {
  return column === 'members' ? (
    <TextLineShape variant="headline" width="40%" />
  ) : (
    <TextLineShape variant="caption" width="70%" />
  )
}
