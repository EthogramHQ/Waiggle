// Le bas d'un fil : « Afficher la suite » tant qu'il en reste, puis, si l'écran le demande, une fin
// discrète. Depuis RF, aucune liste de l'appli n'en dit plus rien : la fin de la liste se voit
// (« C'est tout » et « Tu es à jour » retirés, T3 et T4). Pas de défilement sans fin : on sait où le fil s'arrête, et un bouton se prend aussi au
// clavier. Si la page suivante n'arrive pas, le message d'erreur et « Réessayer » se mettent ici,
// sous les cartes déjà lues, qui restent en place.
//
// R4 : le « Tu es à jour » sur le miel vif de l'accueil a quitté ce composant. Il vit dans
// `UpToDate` (la sphère de miel), que le fil pose avant le premier élément déjà vu, pas forcément
// au bout. Ici reste le bas commun à toutes les listes (fil, commentaires, notifications, membres
// bloqués, modération).
import { space } from '@ruche/brand'
import { type RefObject, useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Button } from './Button'
import { focusTarget, holdsFocus } from './focus'
import { Icon } from './Icon'
import { Notice } from './Notice'
import { Text } from './Text'

type State = 'more' | 'loading' | 'end' | 'error'

type Props = {
  /** more : il reste des pages ; loading : la suivante arrive ; end : tout est lu ; error : raté. */
  state: State
  moreLabel: string
  /** La fin discrète : une coche et ce texte. Sans lui, la liste finit sans rien dire (RF). */
  endLabel?: string
  onMore: () => void
  /** Le message quand la page suivante n'a pas pu se charger, et le bouton pour réessayer. */
  errorLabel?: string
  retryLabel?: string
  /**
   * La vue de la première carte arrivée avec la dernière page (son lien), posée par la liste. Sans
   * phrase de fin, c'est là que le focus du clavier va quand « Afficher la suite » disparaît :
   * la lecture continue à cette carte, au lieu de retomber sur toute la page (jur-RF2).
   */
  firstArrived?: RefObject<View | null>
}

// Où poser le focus dans la première carte arrivée : la liste donne la case de l'élément (une carte
// de projet, une ligne, une notification), qui ne sait pas où est son lien. `focusTarget`
// (ui/focus.ts) y cherche le premier élément que Tab atteint (le lien de la carte, « Débloquer »),
// sinon rend la case elle-même focusable, sans en faire une étape de Tab.

/** La première carte arrivée avec la dernière page : son rang dans la liste, et sa vue. */
export type FirstArrived = { index: number | null; ref: RefObject<View | null> }

/**
 * Hook : la première carte arrivée avec la dernière page d'une liste, à donner à `FeedEnd`
 * (`firstArrived={arrived.ref}`) et à poser sur la case de l'élément de rang `arrived.index`.
 *
 * `count` : le nombre d'éléments affichés ; `loading` : la page suivante est demandée. Pendant le
 * chargement, la liste a encore son ancien nombre d'éléments : il est noté (dans un `useRef`, une
 * mémoire qui survit aux affichages sans en provoquer), et la page arrivée commence à ce rang. Une
 * dernière page vide : la dernière carte de la liste, où la lecture s'est arrêtée.
 */
export function useFirstArrived(count: number, loading: boolean): FirstArrived {
  const ref = useRef<View>(null)
  const before = useRef<number | null>(null)
  // Sans liste de dépendances : après chaque affichage. Le rendu où la page arrive lit donc le
  // nombre noté pendant le chargement, juste avant.
  useEffect(() => {
    if (loading) before.current = count
  })
  const from = before.current
  return { index: from === null || count === 0 ? null : Math.min(from, count - 1), ref }
}

export function FeedEnd({
  state,
  moreLabel,
  endLabel,
  onMore,
  errorLabel,
  retryLabel,
  firstArrived,
}: Props) {
  // Quand la dernière page arrive, le bouton « Afficher la suite » laisse la place à la fin. Si le
  // focus du clavier était sur ce bouton, il passe sur la phrase de fin s'il y en a une (tabIndex
  // -1 : focusable sans être une étape de la touche Tab), sinon sur la première carte arrivée
  // (`firstArrived`), au lieu de se perdre sur toute la page. preventScroll : la page ne saute pas,
  // on reste sur les cartes qui viennent d'arriver.
  //
  // Pourquoi l'effet trouve la carte : React attache les `ref` des vues au moment où il pose le
  // rendu à l'écran, avant de lancer les effets. La carte arrivée avec la dernière page et l'état
  // « end » viennent du même rendu de la liste : quand cet effet tourne, la ref pointe déjà sur elle.
  const button = useRef<View>(null)
  const end = useRef<View>(null)
  const hadFocus = useRef(false)
  // Deux clics dans le même instant arrivent avant que l'écran ne se redessine en « chargement » :
  // ce drapeau, posé au premier clic, fait ignorer le second. Il retombe dès que l'état change.
  const asked = useRef(false)
  useEffect(() => {
    if (state !== 'loading') asked.current = false
  }, [state])
  const more = () => {
    if (asked.current) return
    asked.current = true
    hadFocus.current = holdsFocus(button.current)
    onMore()
  }
  useEffect(() => {
    if (state !== 'end' || !hadFocus.current) return
    hadFocus.current = false
    const target = end.current
      ? (end.current as unknown as { focus?: (options?: object) => void })
      : focusTarget(firstArrived?.current ?? null)
    target?.focus?.({ preventScroll: true })
  }, [state, firstArrived])

  if (state === 'end') {
    if (!endLabel) return null
    return (
      <View
        ref={end}
        {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
        style={{
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: space.lg,
        }}
      >
        <Icon name="check-circle" size={20} tone="muted" />
        <Text tone="muted">{endLabel}</Text>
      </View>
    )
  }
  if (state === 'error') {
    return (
      <View style={{ gap: space.md, paddingVertical: space.md }}>
        {errorLabel ? <Notice message={errorLabel} /> : null}
        <View ref={button} style={{ alignSelf: 'center' }}>
          <Button label={retryLabel ?? moreLabel} onPress={more} variant="secondary" />
        </View>
      </View>
    )
  }
  return (
    // Le même bouton pendant le chargement, occupé : il garde sa place et le focus, et un second
    // appui ne redemande pas la page (Button ignore les appuis tant que loading est vrai).
    <View ref={button} style={{ alignSelf: 'center', paddingVertical: space.md }}>
      <Button label={moreLabel} onPress={more} variant="secondary" loading={state === 'loading'} />
    </View>
  )
}
