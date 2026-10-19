// Le bouton « Suivre » d'une page de membre ou de projet, avec le nombre d'abonnés à côté.
// C'est un interrupteur : le lecteur d'écran annonce « Suivre Léa, interrupteur, désactivé », puis
// « activé » une fois qu'on la suit. Le nom lu reste le même ; seul le texte affiché change
// (« Suivre » en miel, puis « Suivi » en blanc avec une coche : l'action est faite, plus discrète ;
// toujours en blanc quand la page a déjà son action principale, voir `prominent`).
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Button } from './Button'
import { FollowerCount } from './FollowerCount'
import { Notice } from './Notice'

type Props = {
  followed: boolean
  onPress: () => void
  /** Le nom lu par les lecteurs d'écran : ce qu'on suit (« Suivre Léa », « Suivre ce projet »). */
  label: string
  /** Le texte affiché, selon l'état (« Suivre » ou « Suivi »). */
  text: string
  /** Le nombre d'abonnés, déjà écrit (« 12 abonnés »). */
  caption?: string
  /** Un message si le dernier changement n'a pas pu être enregistré. */
  error?: string
  /**
   * En miel quand suivre est l'action principale de la page (celle d'un membre) ; en blanc quand
   * une autre l'est déjà (« Tester la démo » sur un projet) : une seule action miel par écran.
   */
  prominent?: boolean
}

export function FollowButton({
  followed,
  onPress,
  label,
  text,
  caption,
  error,
  prominent = true,
}: Props) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
        <Button
          label={text}
          spokenLabel={label}
          checked={followed}
          onPress={onPress}
          variant={followed || !prominent ? 'secondary' : 'primary'}
          icon={followed ? 'check' : 'plus'}
          size="compact"
        />
        {caption ? <FollowerCount text={caption} /> : null}
      </View>
      {/* Notice est lue dès qu'elle apparaît (role « alert »), comme les autres erreurs. */}
      {error ? <Notice message={error} /> : null}
    </View>
  )
}
