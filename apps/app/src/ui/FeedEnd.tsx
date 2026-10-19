// Le bas d'un fil : « Afficher la suite » tant qu'il en reste, puis « Tu es à jour ». Pas de
// défilement sans fin : on sait où le fil s'arrête, et un bouton se prend aussi au clavier.
import { space } from '@ruche/brand'
import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Button } from './Button'
import { Icon } from './Icon'
import { Text } from './Text'

type State = 'more' | 'loading' | 'end'

type Props = {
  /** more : il reste des pages ; loading : la suivante arrive ; end : tout est lu. */
  state: State
  moreLabel: string
  endLabel: string
  onMore: () => void
}

export function FeedEnd({ state, moreLabel, endLabel, onMore }: Props) {
  // Quand la dernière page arrive, le bouton « Afficher la suite » laisse la place à « Tu es à
  // jour ». Sur le web, le focus du clavier, qui était sur le bouton, passe sur ce message
  // (tabIndex -1 : focusable sans être une étape de la touche Tab) au lieu de se perdre.
  const end = useRef<View>(null)
  const previous = useRef<State>(state)
  useEffect(() => {
    if (Platform.OS === 'web' && previous.current === 'loading' && state === 'end') {
      end.current?.focus()
    }
    previous.current = state
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
  return (
    // Le même bouton pendant le chargement, occupé : il garde sa place, et un second appui ne
    // redemande pas la page (Button est désactivé tant que loading est vrai).
    <View style={{ alignSelf: 'center', paddingVertical: space.md }}>
      <Button
        label={moreLabel}
        onPress={onMore}
        variant="secondary"
        loading={state === 'loading'}
      />
    </View>
  )
}
