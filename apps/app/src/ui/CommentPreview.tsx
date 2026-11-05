// L'aperçu des commentaires sous un projet (R5b, planches `R5b-Commentaires` et bas de
// `R5a-Projet-Desktop`, F-Pr11) : le titre « Commentaires 6 », les premières lignes de la feuille
// (des cartes compactes, données par l'écran), puis un bouton qui ouvre la feuille.
//
// L'écran choisit le bouton (`action`), le composant écrit ses textes :
// - `all` : « Voir les 6 commentaires », quand l'aperçu n'en montre qu'une partie ;
// - `comment` : « Commenter », quand l'aperçu les montre tous ;
// - `write` : « Écrire un commentaire », qui ouvre la feuille le champ prêt ;
// - `null` : pas de bouton (sur ordinateur, 5 commentaires ou moins : le champ est déjà dans la
//   colonne, relecture de l'interface ui-I4).
// Sans commentaire, « Aucun commentaire pour l'instant. » prend la place des lignes, et le titre
// n'a pas de nombre.
//
// Le bouton est donné à `openRef` : la feuille, en se fermant, y rend le focus (sinon il
// retomberait en haut de la page).
import { space } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { CountedTitle } from './CountedTitle'
import { Text } from './Text'

/** Le bouton sous l'aperçu ; `null` : aucun. */
export type CommentPreviewAction = 'all' | 'comment' | 'write' | null

type Props = {
  /** Le nombre de commentaires du projet (`Project.commentCount`), pour le titre et « Voir les N ». */
  count: number
  /** Le bouton sous les lignes (voir plus haut). */
  action: CommentPreviewAction
  /** Ouvre la feuille des commentaires (sur ordinateur, déroule la liste en place). */
  onOpen: () => void
  /** La `ref` du bouton, où la feuille rend le focus en se fermant. */
  openRef?: Ref<View>
  /** Les premières lignes de la feuille (des `CommentCard compact`), dans l'ordre. */
  children?: ReactNode
}

export function CommentPreview({ count, action, onOpen, openRef, children }: Props) {
  const { t } = useTranslation()
  const labels = {
    all: t(($) => $.project.comments.seeAll, { count }),
    comment: t(($) => $.project.comments.addShort),
    write: t(($) => $.project.comments.add),
  }
  return (
    <View style={{ gap: space.lg }}>
      <CountedTitle
        title={t(($) => $.project.comments.title)}
        count={count}
        spokenCount={t(($) => $.project.comments.spokenCount, { count })}
        separator="space"
      />
      {count === 0 ? (
        <Text tone="secondary">{t(($) => $.project.comments.empty)}</Text>
      ) : (
        <View style={{ gap: space.md }}>{children}</View>
      )}
      {action === null ? null : (
        // Rangé à gauche, comme le titre ; le cadre étiré garde au bouton toute la largeur pour
        // passer à la ligne à 200 % de texte (alignItems seul le bornerait à son plus long mot).
        <View style={{ flexDirection: 'row' }}>
          <Button
            ref={openRef}
            label={labels[action]}
            onPress={onOpen}
            variant="secondary"
            size="compact"
          />
        </View>
      )}
    </View>
  )
}
