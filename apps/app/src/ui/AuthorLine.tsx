// La ligne de l'auteur d'un projet (R5a, planche « Projet ») : sa photo, son nom et son pseudo, qui
// mènent à sa page, et à droite une pastille « Suivre » (« Tu suis Léa » une fois suivie). Sur sa
// propre page, personne ne se suit : la pastille n'y est pas.
//
// Deux gestes sur une ligne, jamais l'un dans l'autre : le lien (photo, nom, pseudo) et la pastille
// sont deux éléments voisins (un bouton posé dans un lien ne serait ni lu ni touché correctement).
// La rangée passe à la ligne quand elle ne tient pas (320 points, texte agrandi) : la pastille
// descend sous le nom, rangée à droite.
//
// Ce que la ligne ne sait pas encore ne bouge pas sous le doigt :
// - le pseudo vient d'une seconde lecture (la page du membre) : sa ligne garde sa place, vide,
//   tant qu'il n'est pas arrivé ;
// - l'état « déjà suivi » aussi : tant qu'il n'est pas connu, aucune pastille (un « Suivre » qui
//   basculerait en « Tu suis Léa » sous le doigt ferait faire le geste inverse).
// Ce composant ne lit rien : l'écran lui donne ce qu'il sait (voir `useAuthorLine`, projects/).
import { layout, space } from '@ruche/brand'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import type { ImageSource } from './image'
import { Notice, type NoticeAction } from './Notice'
import { Pressed } from './Pressed'
import { Text } from './Text'

/** La taille de la photo, en points : celle d'une zone à toucher. */
const AVATAR_SIZE = layout.touchTarget

/** Une espace insécable : une ligne de texte vide qui garde sa hauteur. */
const KEEP_LINE = String.fromCodePoint(0xa0)

/** La pastille « Suivre » de l'auteur, quand l'état est connu. */
export type AuthorFollow = {
  /** Vrai si le membre qui regarde suit déjà l'auteur. */
  followed: boolean
  /** Le nom lu : « Suivre Léa », puis « Tu suis Léa » (il contient le texte affiché). */
  label: string
  /** Le texte affiché : « Suivre », puis « Tu suis Léa ». */
  text: string
  /** Le toucher, qui reçoit l'état affiché à cet instant (voir `useFollow`). */
  onPress: (shown: boolean) => void
  /** Inactive, à sa place (compte suspendu qui vient de ne plus suivre, tranche 7c). */
  disabled?: boolean
}

export type AuthorLineProps = {
  name: string
  /** Le pseudo déjà écrit (« @lea ») ; absent tant qu'il n'est pas lu : sa ligne reste réservée. */
  handle?: string | undefined
  avatar: ImageSource | null
  /** Le nom du lien vers sa page (« Voir la page de Léa »). */
  openLabel: string
  onOpen: () => void
  /** La pastille ; null ou absente : aucune (sa propre page, état pas encore connu). */
  follow?: AuthorFollow | null | undefined
  /** Le message si le dernier geste sur la pastille n'a pas pu être enregistré. */
  error?: string | undefined
  /** Un lien sous ce message (« Me reconnecter », session expirée). */
  errorAction?: NoticeAction | undefined
}

export function AuthorLine({
  name,
  handle,
  avatar,
  openLabel,
  onOpen,
  follow,
  error,
  errorAction,
}: AuthorLineProps) {
  return (
    <View style={{ gap: space.sm }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          rowGap: space.xs,
        }}
      >
        {/* Le lien prend la place qu'il lui faut (flexBasis auto), puis le reste de la rangée :
            quand la pastille ne tient plus à côté, elle passe dessous. flexShrink et maxWidth : un
            nom très long ne sort pas de l'écran (sur le web, une vue ne rétrécit pas seule). */}
        <View style={{ flexGrow: 1, flexBasis: 'auto', flexShrink: 1, maxWidth: '100%' }}>
          <Pressed label={openLabel} role="link" onPress={onOpen}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              {/* La photo est décorative : le nom du lien dit déjà de qui il s'agit. */}
              <Avatar name={name} source={avatar} label="" size={AVATAR_SIZE} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                {/* Un nom ne se coupe jamais par « … » : il passe sur deux lignes s'il le faut. */}
                <Text weight={700} breakAnywhere>
                  {name}
                </Text>
                {/* Le pseudo, discret ; une espace insécable tant qu'il n'est pas lu, pour que la
                    ligne garde sa hauteur et que rien ne bouge à son arrivée. */}
                <Text variant="caption" tone="muted" breakAnywhere>
                  {handle ?? KEEP_LINE}
                </Text>
              </View>
            </View>
          </Pressed>
        </View>
        {follow ? (
          // marginLeft auto : à droite de la rangée, et à droite encore quand elle passe dessous.
          <View style={{ marginLeft: 'auto', maxWidth: '100%', flexShrink: 1 }}>
            <FollowButton
              variant="chip"
              followed={follow.followed}
              onPress={() => follow.onPress(follow.followed)}
              label={follow.label}
              text={follow.text}
              disabled={follow.disabled ?? false}
            />
          </View>
        ) : null}
      </View>
      {/* Lu dès qu'il apparaît (role « alert »), comme les autres erreurs de la page. */}
      {error ? <Notice message={error} action={errorAction} /> : null}
    </View>
  )
}
