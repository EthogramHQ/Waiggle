// Le haut du fil : une phrase qui dit ce qu'il montre, remplacée par le bandeau « 3 nouveautés »
// quand il y a du nouveau. Les deux occupent la même place, réservée en permanence : quand le
// bandeau apparaît, rien ne bouge en dessous. Le fil ne se déplace jamais tout seul sous le doigt ;
// c'est la personne qui choisit d'afficher les nouveautés.
import { layout } from '@ruche/brand'
import { useRef } from 'react'
import { Platform, View } from 'react-native'
import { Button } from './Button'
import { Text } from './Text'

type Props = {
  /** Le texte du bandeau, déjà écrit avec son nombre (« 3 nouveautés ») ; null : rien de neuf. */
  label: string | null
  /** Ce qu'il faut faire au toucher : relire le fil (la promesse se termine une fois relu). */
  onPress: () => unknown
  /** La phrase affichée quand il n'y a rien de neuf (« Les nouveaux projets des personnes… »). */
  caption?: string
}

export function NewItemsBanner({ label, onPress, caption }: Props) {
  // La place du bandeau. Après un toucher, le bandeau disparaît : sur le web, le focus du clavier
  // revient ici (tabIndex -1 : on peut y poser le focus, mais la touche Tab ne s'y arrête pas), au
  // lieu de retomber tout en haut de la page.
  const slot = useRef<View>(null)
  const show = async () => {
    await onPress()
    if (Platform.OS === 'web') slot.current?.focus()
  }
  return (
    <View
      ref={slot}
      {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
      style={{
        minHeight: layout.controlHeight.compact,
        // À gauche, comme le choix du fil et le reste de l'accueil.
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      {label ? (
        // En verre plutôt qu'en miel : « Publier un projet » reste la seule action miel de l'écran.
        <Button
          label={label}
          onPress={() => void show()}
          icon="sparkle"
          variant="glass"
          size="compact"
        />
      ) : caption ? (
        <Text variant="callout" tone="secondary">
          {caption}
        </Text>
      ) : null}
    </View>
  )
}
