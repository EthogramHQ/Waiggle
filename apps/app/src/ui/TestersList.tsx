// La liste des testeurs d'un projet, en haut du coin des testeurs (tranche R7b, planche validée 1).
// - Pour un testeur, « 12 testeurs » n'est qu'un texte : les testeurs ne se voient pas entre eux
//   (`testers` vaut alors null).
// - Pour l'auteur, « 12 testeurs » est un bouton qui déplie la liste (`Disclosure` en ligne, sans
//   carte) : les 4 inscrits les plus récents (l'API les donne du plus récent au plus ancien), puis
//   « Afficher les 8 autres ». Chaque testeur : sa photo, son nom, « depuis le 3 nov. », et un menu
//   « … » (« Actions pour Inès Morel ») qui propose « Retirer des testeurs ». La confirmation de ce
//   retrait appartient à l'écran, qui reçoit l'identifiant par `onRemove`.
// - Sans `onRemove` (coin fermé : l'auteur relit tout sans rien changer), la liste se lit sans menu.
//
// Le focus (relecture du plan, ui-B8) : « Afficher les 8 autres » disparaît quand on le touche. Le
// focus, qui était sur lui, retomberait en haut de la page ; il va au premier testeur nouvellement
// montré, le cinquième, au clavier (web) comme pour le lecteur d'écran (téléphone).
import { layout } from '@ruche/brand'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ActionMenu } from './ActionMenu'
import { Avatar } from './Avatar'
import { Disclosure } from './Disclosure'
import { focusTarget, focusWithoutScroll, moveReaderTo } from './focus'
import type { ImageSource } from './image'
import { ListGroup, ListRow } from './ListGroup'
import { shortDate } from './relativeDate'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useHydrated } from './theme/hydration'

/** Un testeur de la liste, tel que l'écran le prépare depuis l'API (photo déjà prête à montrer). */
export type TestersListItem = {
  id: string
  name: string
  avatar: ImageSource | null
  /** Sa date d'inscription (ISO), écrite « depuis le 3 nov. ». */
  since: string
}

type Props = {
  /** Le nombre de testeurs, écrit « 12 testeurs ». */
  count: number
  /** Les testeurs, du plus récent inscrit au plus ancien ; null pour un testeur, qui n'en voit aucun. */
  testers: TestersListItem[] | null
  /** Retirer ce testeur (l'écran demande d'abord confirmation). Absent : aucun menu. */
  onRemove?: (id: string) => void
  /** Déplié dès l'affichage : pour le catalogue, qui montre la liste ouverte sans qu'on la touche. */
  initiallyOpen?: boolean
}

/** Le nombre de testeurs montrés avant « Afficher les N autres » (planche validée 1). */
export const TESTERS_PREVIEW = 4

/** La taille des photos : celle de la planche, assez pour reconnaître quelqu'un. */
const AVATAR_SIZE = 40

export function TestersList({ count, testers, onRemove, initiallyOpen = false }: Props) {
  const { t } = useTranslation()
  const label = t(($) => $.project.testers.count, { count })
  // Toute la liste montrée, après « Afficher les N autres ». Gardé ici, au-dessus du repli : le
  // membre qui replie puis redéplie retrouve ce qu'il avait ouvert.
  const [showAll, setShowAll] = useState(false)
  // La ligne du premier testeur caché jusque-là, et le focus à lui donner dès qu'elle est là.
  const firstShown = useRef<View>(null)
  const focusPending = useRef(false)

  // Un effet (useEffect) s'exécute après que React a posé les nouvelles lignes : la ligne du
  // cinquième testeur existe alors, on peut y mettre le focus.
  useEffect(() => {
    if (!showAll || !focusPending.current) return
    focusPending.current = false
    const node = firstShown.current
    // Sur le web, le focus du clavier, sans faire défiler la page : sur le premier contrôle de la
    // ligne (son « … ») s'il y en a un, sinon sur la ligne elle-même. Sur téléphone, le lecteur
    // d'écran, qui n'a pas de focus du clavier.
    if (!focusWithoutScroll(focusTarget(node))) moveReaderTo(node)
  }, [showAll])

  if (testers === null) {
    return (
      // La même hauteur que le bouton de l'auteur : les onglets du coin restent à la même place.
      <View style={{ minHeight: layout.controlHeight.regular, justifyContent: 'center' }}>
        <Text variant="callout" tone="secondary">
          {label}
        </Text>
      </View>
    )
  }

  const shown = showAll ? testers : testers.slice(0, TESTERS_PREVIEW)
  const hidden = testers.length - shown.length
  return (
    <Disclosure title={label} icon={null} variant="inline" initiallyOpen={initiallyOpen}>
      {testers.length === 0 ? (
        <Text variant="callout" tone="muted">
          {t(($) => $.project.testers.list.empty)}
        </Text>
      ) : (
        <ListGroup list>
          {shown.map((tester, index) => (
            <TesterRow
              key={tester.id}
              tester={tester}
              onRemove={onRemove}
              rowRef={index === TESTERS_PREVIEW ? firstShown : undefined}
            />
          ))}
        </ListGroup>
      )}
      {hidden > 0 ? (
        // Rangé à gauche, à sa largeur : sa zone à toucher ne court pas sur toute la ligne.
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
          <TextLink
            role="button"
            label={t(($) => $.project.testers.list.showMore, { count: hidden })}
            onPress={() => {
              focusPending.current = true
              setShowAll(true)
            }}
          />
        </View>
      ) : null}
    </Disclosure>
  )
}

type RowProps = {
  tester: TestersListItem
  onRemove: ((id: string) => void) | undefined
  rowRef: RefObject<View | null> | undefined
}

/** Une ligne : la photo, le nom, « depuis le 3 nov. », et le menu « … » si l'auteur peut retirer. */
function TesterRow({ tester, onRemove, rowRef }: RowProps) {
  const { t, i18n } = useTranslation()
  const hydrated = useHydrated()
  // Avant l'hydratation du web, la date sert de « maintenant » : l'année n'est jamais écrite, et le
  // pré-rendu écrit le même texte que le premier affichage du navigateur (comme RelativeTime).
  const date = shortDate(
    tester.since,
    i18n.language,
    hydrated ? new Date() : new Date(tester.since),
  )
  return (
    <ListRow
      ref={rowRef}
      label={tester.name}
      // Décorative : le nom, écrit juste à côté, dit déjà de qui il s'agit.
      leading={<Avatar name={tester.name} source={tester.avatar} label="" size={AVATAR_SIZE} />}
      detail={t(($) => $.project.testers.list.since, { date })}
      trailing={
        onRemove ? (
          <ActionMenu
            variant="bare"
            align="end"
            label={t(($) => $.project.testers.list.menu, { name: tester.name })}
            items={[
              {
                label: t(($) => $.project.testers.remove),
                tone: 'danger',
                onPress: () => onRemove(tester.id),
              },
            ]}
          />
        ) : undefined
      }
    />
  )
}
