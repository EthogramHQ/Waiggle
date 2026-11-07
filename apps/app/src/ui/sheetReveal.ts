// Amener un élément dans la zone qui défile d'une feuille, et l'y garder (R5b, relecture de design
// C4). « Répondre » sur une carte du bas : le pied de la feuille grandit (le bandeau « Tu réponds à
// … »), puis le clavier sort, et la zone qui défile rétrécit deux fois sous la carte visée, qui
// disparaissait. L'écran demande donc une fois « garde cette carte en vue » (`reveal`) ; la feuille
// fait défiler tout de suite, puis à chaque changement de hauteur de la zone (`onLayout`, qu'on doit
// au clavier sur iOS comme sur Android).
//
// Cela s'arrête dès que le membre fait défiler lui-même (doigt, molette), ou quand l'écran demande
// `reveal(null)` : la liste ne bouge plus sans geste de sa part.
//
// `measureLayout` donne la place de l'élément dans le contenu de la liste, sur téléphone comme sur le
// web (react-native-web la lit dans la page, dans un `setTimeout`).
import { space } from '@ruche/brand'
import { type Ref, useImperativeHandle, useRef } from 'react'
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native'

/** Ce qu'un écran reçoit de la feuille. */
export type SheetReveal = {
  /** Garde cet élément (la `ref` d'une vue de la liste) dans la zone ; `null` : la laisse tranquille. */
  reveal: (node: unknown) => void
}

/** L'air gardé entre l'élément et le bord de la zone. */
const MARGIN = space.md

/**
 * La position où faire défiler pour voir `card` (sa place dans le contenu), dans une zone qui montre
 * `zone.height` points à partir de `zone.offset`. `null` : elle est déjà en vue, rien ne bouge. Une
 * carte plus haute que la zone montre son début : c'est là que commence sa lecture.
 */
export const revealOffset = (
  card: { top: number; height: number },
  zone: { offset: number; height: number },
  margin: number = MARGIN,
): number | null => {
  const atTop = Math.max(0, card.top - margin)
  if (card.height + 2 * margin > zone.height) return atTop === zone.offset ? null : atTop
  if (atTop < zone.offset) return atTop
  const atBottom = card.top + card.height + margin - zone.height
  return atBottom > zone.offset ? atBottom : null
}

type Measurable = {
  measureLayout?: (
    relativeTo: unknown,
    done: (x: number, y: number, width: number, height: number) => void,
    failed?: () => void,
  ) => void
}

/**
 * Hook de `SheetPanel`. Rend la `ref` à poser sur la liste qui défile, celle de son contenu (les
 * places se mesurent par rapport à lui), et les réglages de la liste. `calm` : sans animation
 * (« Réduire les animations »).
 */
export const useSheetReveal = (handle: Ref<SheetReveal> | undefined, calm: boolean) => {
  const scroller = useRef<ScrollView>(null)
  const content = useRef<unknown>(null)
  const target = useRef<Measurable | null>(null)
  const zone = useRef({ offset: 0, height: 0 })

  const place = () => {
    const node = target.current
    // Hauteur encore inconnue (la feuille vient de s'ouvrir) : `onLayout` rappellera.
    if (!node?.measureLayout || !content.current || zone.current.height === 0) return
    node.measureLayout(content.current, (_x, top, _width, height) => {
      // Entre-temps, le membre a pu faire défiler, ou le geste a pu finir.
      if (target.current !== node) return
      const y = revealOffset({ top, height }, zone.current)
      if (y !== null) scroller.current?.scrollTo({ y, animated: !calm })
    })
  }

  // useImperativeHandle : ce que l'écran reçoit dans sa `ref`, à la place de la feuille elle-même.
  useImperativeHandle(handle, () => ({
    reveal: (node) => {
      target.current = (node ?? null) as Measurable | null
      place()
    },
  }))

  const letGo = () => {
    target.current = null
  }

  return {
    scroller,
    content,
    listProps: {
      scrollEventThrottle: 16,
      onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
        zone.current.offset = nativeEvent.contentOffset.y
      },
      onLayout: ({ nativeEvent }: LayoutChangeEvent) => {
        const { height } = nativeEvent.layout
        if (height === zone.current.height) return
        zone.current.height = height
        place()
      },
      // Le membre fait défiler lui-même : au doigt (téléphone), à la molette ou au doigt (web).
      onScrollBeginDrag: letGo,
      onWheel: letGo,
      onTouchMove: letGo,
    },
  }
}
