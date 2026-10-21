// Le bouton « Suivre » d'une page de membre ou de projet, avec le nombre d'abonnés à côté.
// C'est un interrupteur : le lecteur d'écran annonce « Suivre Léa, interrupteur, désactivé », puis
// « activé » une fois qu'on la suit. Le texte affiché change (« Suivre » en miel, puis « Suivi » en
// blanc avec une coche : l'action est faite, plus discrète ; toujours en blanc quand la page a déjà
// son action principale, voir `prominent`), et le nom lu le reprend toujours (« Suivi : Léa ») :
// c'est l'écran qui le donne, selon l'état.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Button } from './Button'
import { FollowerCount } from './FollowerCount'
import { Notice, type NoticeAction } from './Notice'

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
   * Un lien sous le message d'erreur (« Me reconnecter » quand la session a expiré, tranche 6c).
   */
  errorAction?: NoticeAction | undefined
  /**
   * En miel quand suivre est l'action principale de la page (celle d'un membre) ; en blanc quand
   * une autre l'est déjà (« Tester la démo » sur un projet) : une seule action miel par écran.
   */
  prominent?: boolean
  /**
   * row : le nombre à droite du bouton ; stacked : le nombre au-dessus, le tout centré (l'en-tête
   * d'une page de membre, dans l'axe de l'avatar et du nom).
   */
  layout?: 'row' | 'stacked'
}

export function FollowButton({
  followed,
  onPress,
  label,
  text,
  caption,
  error,
  errorAction,
  prominent = true,
  layout = 'row',
}: Props) {
  const stacked = layout === 'stacked'
  const button = (
    <Button
      label={text}
      spokenLabel={label}
      checked={followed}
      onPress={onPress}
      variant={followed || !prominent ? 'secondary' : 'primary'}
      icon={followed ? 'check' : 'plus'}
      size="compact"
    />
  )
  return (
    <View style={{ gap: space.sm, alignItems: stacked ? 'center' : 'stretch' }}>
      {stacked ? (
        // Le nombre au-dessus : il ne bouge pas quand le bouton passe de « Suivre » à « Suivi ».
        <>
          {caption ? <FollowerCount text={caption} /> : null}
          {button}
        </>
      ) : (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}
        >
          {button}
          {caption ? <FollowerCount text={caption} /> : null}
        </View>
      )}
      {/* Notice est lue dès qu'elle apparaît (role « alert »), comme les autres erreurs. */}
      {error ? <Notice message={error} action={errorAction} /> : null}
    </View>
  )
}
