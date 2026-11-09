// La zone des décisions d'une carte d'administration (tranche R6b : `PendingToolCard`,
// `UncategorizedCard`) : ses boutons tant que rien n'est décidé, puis, à la même place, le résultat
// (« Ajouté au catalogue. », « Rangé dans Animaux. »).
//
// Deux règles de la modération (tranche 7a), réglées ici une fois pour les deux cartes :
// - rien ne remonte sous le doigt : le résultat garde au moins la hauteur qu'avaient les boutons
//   (mesurée à chaque dessin : sur téléphone ou à texte agrandi, ils tiennent sur deux ou trois
//   lignes), et jamais moins de 44 points. La carte suivante reste où elle était ;
// - le focus ne se perd pas : le bouton touché disparaît avec la décision. Si le focus du clavier
//   était dessus (il retombe alors sur la page entière), il passe au résultat, sans faire défiler
//   la page, et le lecteur d'écran le lit. S'il est ailleurs (dans une feuille encore ouverte), on
//   ne le lui prend pas : l'écran peut le poser lui-même sur le résultat par `resultRef`.
import { layout } from '@ruche/brand'
import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { focusWithoutScroll } from './focus'
import { Notice } from './Notice'

type Props = {
  /** La phrase du résultat, déjà traduite ; null tant que rien n'est décidé. */
  result: string | null
  /** Les boutons des décisions, montrés tant que `result` vaut null. */
  actions: ReactNode
  /** Pour poser le focus sur le résultat depuis l'écran (après la fermeture d'une feuille). */
  resultRef?: Ref<View | null> | undefined
}

/** Le focus du clavier s'est-il perdu (web) : sur la page entière, ou nulle part ? */
const focusLost = (): boolean => {
  const page = (globalThis as { document?: { body?: unknown; activeElement?: unknown } }).document
  if (!page) return false
  return page.activeElement === null || page.activeElement === page.body
}

/** Donne `node` à une ref reçue de l'écran, qu'elle soit une fonction ou un objet `{ current }`. */
const assign = (ref: Ref<View | null> | undefined, node: View | null) => {
  if (typeof ref === 'function') ref(node)
  else if (ref) ref.current = node
}

export function DecidedZone({ result, actions, resultRef }: Props) {
  // La dernière hauteur dessinée des boutons. onLayout est posé dès le premier dessin : sur le web,
  // un onLayout ajouté plus tard n'est jamais appelé (charte).
  const [height, setHeight] = useState(0)
  const onLayout = (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height)
  // La vue du résultat, gardée ici (pour le focus) et donnée à l'écran (sa propre ref).
  const notice = useRef<View | null>(null)
  const keepNotice = (node: View | null) => {
    notice.current = node
    assign(resultRef, node)
  }
  // Le résultat vient-il d'arriver pendant cette visite ? Une carte déjà décidée au montage (on
  // revient sur la page) ne prend pas le focus.
  const decided = result !== null
  const wasDecided = useRef(decided)
  // useLayoutEffect : juste après que le bouton a quitté la page, avant que le navigateur dessine.
  useLayoutEffect(() => {
    if (decided && !wasDecided.current && focusLost()) focusWithoutScroll(notice.current)
    wasDecided.current = decided
  }, [decided])
  if (result !== null) {
    return (
      <View style={{ minHeight: Math.max(height, layout.touchTarget), justifyContent: 'center' }}>
        <Notice message={result} tone="success" polite ref={keepNotice} />
      </View>
    )
  }
  return <View onLayout={onLayout}>{actions}</View>
}
