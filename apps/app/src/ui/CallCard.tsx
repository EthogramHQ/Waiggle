// La carte d'un appel à tester (R7b, onglet « Appels » du coin des testeurs ; planche validée 9,
// `R7b-Coin-Appels`). L'auteur d'un projet lance un appel à ses testeurs (« Essayez le niveau 3 ce
// week-end ») ; la carte le montre à tous, auteur compris :
// - en haut, un mégaphone et la date relative (« il y a 2 h »), et au bout de la rangée le menu
//   « … » (supprimer pour l'auteur, signaler pour un testeur), nommé par le début de l'appel pour
//   que deux cartes n'aient jamais deux boutons du même nom ;
// - l'avis de la modération, quand l'écran en donne un (`removal`, un `RemovalNotice`) ;
// - le texte entier, jamais replié : un appel est court (500 caractères) et se lit d'un bout à
//   l'autre ;
// - une photo facultative, sur toute la largeur de la carte.
//
// La photo est privée au coin (relecture de sécurité du plan, sec-A4) : elle se charge sans cache
// disque (`cachePolicy="memory"`), pour que l'appareil ne garde pas une image que le membre ne
// pourra plus voir une fois retiré des testeurs. Elle est nommée par la description écrite par
// l'auteur, ou, sans description, par « Photo jointe à l'appel ».
//
// La carte n'a pas de rôle à elle : l'écran la pose dans sa liste. Elle ne parle pas à l'API : les
// actions du menu et l'adresse de la photo arrivent toutes prêtes.
import { space } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { excerpt } from './CommentAction'
import type { Focusable } from './focus'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { ProjectCover } from './ProjectCover'
import { RelativeTime } from './RelativeTime'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** Le texte de l'appel, tel qu'écrit par l'auteur (texte brut, sauts de ligne compris). */
  text: string
  /** La date de l'appel, au format ISO du contrat. */
  at: string
  /** La photo jointe, avec la description écrite par l'auteur (vide : pas décrite). */
  photo?: { source: ImageSource; description: string } | null
  /** L'avis de la modération (un `RemovalNotice`), posé au-dessus du texte. */
  removal?: ReactNode
  /** Les actions du menu « … » ; vide ou absent : pas de bouton du tout. */
  menu?: ActionMenuItem[]
  /**
   * La vue où poser le focus sur cet appel : son texte (le coin des testeurs y mène la lecture après
   * « Afficher les appels précédents », ou après la suppression d'un appel voisin).
   */
  focusRef?: Ref<Focusable>
}

/** La hauteur de la photo, celle de la planche : assez grande pour être lue, sans manger l'écran. */
const PHOTO_HEIGHT = 168
/**
 * Le début de l'appel qui nomme le menu : assez pour distinguer deux appels, assez court pour que
 * le nom du bouton se lise d'une traite. 80 caractères, comme le menu d'un message du fil
 * (`MessageBubble`) : à 40, deux appels qui commencent de la même façon (« Essayez le niveau 3… »)
 * avaient deux menus du même nom.
 */
const MENU_EXCERPT = 80
/**
 * De combien le bouton « … » (44 points) déborde dans la marge de la carte, en haut et à droite,
 * comme sur la planche : son disque reste aligné sur le texte, sa zone à toucher garde 44 points.
 */
const MENU_HANG = space.sm

export function CallCard({ text, at, photo = null, removal, menu = [], focusRef }: Props) {
  const { t } = useTranslation()
  // Le nom du menu reprend le début de l'appel, sur une ligne : les sauts de ligne et les blancs
  // répétés deviennent une espace (un nom lu ne passe pas à la ligne).
  const menuLabel = t(($) => $.project.testers.calls.menu, {
    excerpt: excerpt(text.replace(/\s+/g, ' ').trim(), MENU_EXCERPT),
  })
  // Une description faite de blancs ne décrit rien : le nom fixe la remplace.
  const photoName = photo?.description.trim()
    ? photo.description
    : t(($) => $.project.testers.calls.photoName)

  return (
    <Surface variant="grouped" padding="lg" gap="sm">
      {/* La rangée du haut : le mégaphone et la date à gauche, le menu au bout. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 }}>
          {/* Le mégaphone dit « un appel » à l'œil ; l'onglet le dit déjà au lecteur d'écran. */}
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexShrink: 0 }}
          >
            <Icon name="megaphone-simple" size={15} tone="muted" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <RelativeTime date={at} />
          </View>
        </View>
        {menu.length > 0 ? (
          // marginLeft auto : le menu reste au bout de la rangée, quelle que soit la date.
          <View style={{ marginLeft: 'auto', marginVertical: -MENU_HANG, marginRight: -MENU_HANG }}>
            <ActionMenu
              items={menu}
              label={menuLabel}
              // Sans disque au repos : répété à chaque carte, il pèserait plus que le texte.
              variant="bare"
              // Au bout de la rangée : le menu s'ouvre vers la gauche, au-dessus de la carte.
              align="end"
            />
          </View>
        ) : null}
      </View>
      {removal ?? null}
      {/* Texte brut, affiché tel quel avec ses sauts de ligne ; sélectionnable pour le recopier. */}
      <Text selectable {...(focusRef ? { focusRef } : null)}>
        {text}
      </Text>
      {photo ? (
        // Une image nommée : sa description, ou « Photo jointe à l'appel ». L'image elle-même n'a
        // pas de nom à elle (nom vide), sinon le navigateur lirait deux images l'une dans l'autre.
        <View accessible accessibilityRole="image" accessibilityLabel={photoName}>
          <ProjectCover
            height={PHOTO_HEIGHT}
            radius="small"
            image={{ source: photo.source, label: '', cachePolicy: 'memory' }}
          />
        </View>
      ) : null}
    </Surface>
  )
}
