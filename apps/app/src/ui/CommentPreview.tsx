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
// Sans rien à lire, « Aucun commentaire pour l'instant. » prend la place des lignes, et le titre
// n'a pas de nombre. Un compteur à 0 ne suffit pas à le dire : il ne compte ni le commentaire retiré
// de son auteur, ni celui qu'il a masqué (`seeAllCount`, décision 22 du scénario).
//
// Le bouton est donné à `openRef` : la feuille, en se fermant, y rend le focus (sinon il
// retomberait en haut de la page). Le titre est donné à `titleRef`, pour la même raison, quand il
// ne reste rien d'autre à focaliser dans la section.
import { space } from '@ruche/brand'
import { Children, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { CountedTitle } from './CountedTitle'
import type { Focusable } from './focus'
import { Text } from './Text'

/** Le bouton sous l'aperçu ; `null` : aucun. */
export type CommentPreviewAction = 'all' | 'comment' | 'write' | null

type Props = {
  /** Le nombre de commentaires du projet (`Project.commentCount`), pour le titre et « Voir les N ». */
  count: number
  /**
   * Le nombre lu dans « Voir les N », s'il diffère du titre : un suspendu dont le seul commentaire est
   * retiré a de quoi lire, le compteur du projet ne le compte pas.
   */
  seeAllCount?: number
  /** La phrase sans commentaire ; par défaut « Aucun commentaire pour l'instant. ». */
  emptyLabel?: string
  /** Le bouton sous les lignes (voir plus haut). */
  action: CommentPreviewAction
  /** Ouvre la feuille des commentaires (sur ordinateur, déroule la liste en place). */
  onOpen: () => void
  /** La `ref` du bouton, où la feuille rend le focus en se fermant. */
  openRef?: Ref<View>
  /** La `ref` du titre, pour y poser le focus quand rien d'autre ne peut le prendre. */
  titleRef?: Ref<Focusable>
  /** Les premières lignes de la feuille (des `CommentCard compact`), dans l'ordre. */
  children?: ReactNode
  /**
   * R8 : la feuille est ouverte par-dessus. Ses lignes, qui la répètent, sont cachées aux lecteurs
   * d'écran (elles restent dessinées : la page dessous ne bouge pas) ; un commentaire n'est lu
   * qu'une fois, dans la feuille.
   */
  covered?: boolean
}

export function CommentPreview({
  count,
  seeAllCount = count,
  emptyLabel,
  action,
  onOpen,
  openRef,
  titleRef,
  children,
  covered = false,
}: Props) {
  const { t } = useTranslation()
  // Children.toArray retire les « rien » : sans ligne à montrer, la phrase prend leur place, quoi que
  // dise le nombre (l'écran peut aussi donner autre chose : un chargement, une panne, la liste).
  const hasLines = Children.toArray(children).length > 0
  const labels = {
    all: t(($) => $.project.comments.seeAll, { count: seeAllCount }),
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
        {...(titleRef ? { focusRef: titleRef } : null)}
      />
      {hasLines ? (
        <View
          style={{ gap: space.md }}
          {...(covered
            ? { 'aria-hidden': true, importantForAccessibility: 'no-hide-descendants' as const }
            : null)}
        >
          {children}
        </View>
      ) : count === 0 && seeAllCount === 0 ? (
        <Text tone="secondary">{emptyLabel ?? t(($) => $.project.comments.empty)}</Text>
      ) : null}
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
