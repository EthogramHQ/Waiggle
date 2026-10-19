// Le bas d'un fil : « Afficher la suite » tant qu'il en reste, puis « Tu es à jour ». Pas de
// défilement sans fin : on sait où le fil s'arrête, et un bouton se prend aussi au clavier. Si la
// page suivante n'arrive pas, le message d'erreur et « Réessayer » se mettent ici, sous les cartes
// déjà lues, qui restent en place.
import { space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Button } from './Button'
import { Icon } from './Icon'
import { Notice } from './Notice'
import { Text } from './Text'

type State = 'more' | 'loading' | 'end' | 'error'

type Props = {
  /** more : il reste des pages ; loading : la suivante arrive ; end : tout est lu ; error : raté. */
  state: State
  moreLabel: string
  endLabel: string
  onMore: () => void
  /** Le message quand la page suivante n'a pas pu se charger, et le bouton pour réessayer. */
  errorLabel?: string
  retryLabel?: string
}

// Le peu du navigateur dont on a besoin ici : l'élément qui a le focus, et savoir si un élément en
// contient un autre. (Les types de React Native ne décrivent pas la page web.)
type WebNode = { contains?: (node: unknown) => boolean; focus?: (options?: object) => void }
const activeElement = () =>
  (globalThis as { document?: { activeElement: unknown } }).document?.activeElement

export function FeedEnd({ state, moreLabel, endLabel, onMore, errorLabel, retryLabel }: Props) {
  // Quand la dernière page arrive, le bouton « Afficher la suite » laisse la place à « Tu es à
  // jour ». Si le focus du clavier était sur ce bouton, il passe sur ce message (tabIndex -1 :
  // focusable sans être une étape de la touche Tab) au lieu de se perdre. preventScroll : la page
  // ne saute pas jusqu'à lui, on reste sur les cartes qui viennent d'arriver.
  const button = useRef<View>(null)
  const end = useRef<View>(null)
  const hadFocus = useRef(false)
  const more = () => {
    const node = button.current as unknown as WebNode | null
    hadFocus.current = Platform.OS === 'web' && Boolean(node?.contains?.(activeElement()))
    onMore()
  }
  useEffect(() => {
    if (state !== 'end' || !hadFocus.current) return
    hadFocus.current = false
    ;(end.current as unknown as WebNode | null)?.focus?.({ preventScroll: true })
  }, [state])

  if (state === 'end') {
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
