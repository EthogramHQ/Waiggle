// Outil des tests de R16 (« Les squelettes », plan, choix 4) : une pièce de squelette (la carte vide,
// la ligne vide d'une liste, le champ vide…) se dessine dans le composant qu'elle imite, mais sans
// rôle ni nom à elle. Un seul `progressbar` nommé « Chargement » enveloppe toutes les pièces d'une
// zone (`Loading`, ui/Skeleton.tsx) : si chaque pièce se nommait, un lecteur d'écran entendrait
// « Chargement » cinq fois pour une liste de cinq lignes.
//
// La pièce est posée dans un cadre repéré (`PieceHost`) ; on parcourt ensuite tout ce qu'elle a
// dessiné dessous, lecteurs d'écran ou non (`includeHiddenElements`), et on relève chaque rôle, nom
// ou texte trouvé. Une pièce vide (qui ne dessine rien) ne passe pas : il faut des formes.
import { screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

const HOST = 'empty-piece-host'

/** Le cadre de la pièce : une vue sans rôle, que le test retrouve par son identifiant. */
export function PieceHost({ children }: { children: ReactNode }) {
  return <View testID={HOST}>{children}</View>
}

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }

/** Les propriétés qui donnent un rôle ou un nom, sur le web comme sur téléphone. */
const SPEAKING_PROPS = [
  'accessibilityRole',
  'role',
  'accessibilityLabel',
  'aria-label',
  'aria-labelledby',
  'accessibilityLabelledBy',
] as const

/**
 * Ce que la pièce dessine : le nombre de vues sous le cadre, et tout ce qui s'y lirait (un rôle, un
 * nom, un texte), décrit en clair pour le message d'échec.
 */
export const emptyPiece = (): { drawn: number; spoken: string[] } => {
  const host = screen.getByTestId(HOST, { includeHiddenElements: true }) as unknown as Node
  let drawn = 0
  const spoken: string[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') {
      if (node.trim() !== '') spoken.push(`texte « ${node} »`)
      return
    }
    drawn += 1
    for (const prop of SPEAKING_PROPS) {
      const value = node.props[prop]
      if (value !== undefined && value !== null && value !== 'none')
        spoken.push(`${prop}=${String(value)}`)
    }
    for (const child of node.children) visit(child)
  }
  for (const child of host.children) visit(child)
  return { drawn, spoken }
}

/**
 * Les mesures posées sous le cadre, en points : hauteurs (`height`, `minHeight`) et largeurs
 * (`width`, `minWidth`) écrites en nombre. Une pièce prend la place de ce qu'elle imite : on y
 * cherche la hauteur de la vraie carte, lue sur son composant (jamais recopiée).
 */
export const drawnSizes = (): { heights: number[]; widths: number[] } => {
  const host = screen.getByTestId(HOST, { includeHiddenElements: true }) as unknown as Node
  const heights: number[] = []
  const widths: number[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    for (const key of ['height', 'minHeight'])
      if (typeof style[key] === 'number') heights.push(style[key])
    for (const key of ['width', 'minWidth'])
      if (typeof style[key] === 'number') widths.push(style[key])
    for (const child of node.children) visit(child)
  }
  for (const child of host.children) visit(child)
  return { heights, widths }
}
