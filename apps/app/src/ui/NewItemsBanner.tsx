// Le haut du fil : une phrase qui dit ce qu'il montre, remplacée par le bouton « 3 nouveaux
// projets » quand il y a du nouveau (refonte, tranche R4). Les deux occupent la même place, réservée
// en permanence : quand le bouton apparaît, rien ne bouge en dessous. Le fil ne se déplace jamais
// tout seul sous le doigt ; c'est la personne qui choisit d'afficher les nouveautés.
//
// Le bouton montre les visages des auteurs arrivés (3 au plus) : un décor, caché aux lecteurs
// d'écran, puisque le nom du bouton dit déjà tout. Son texte, c'est ce composant qui l'écrit, à
// partir de ce qui est arrivé : des projets, des mises à jour, ou des deux (« nouveautés »), et « ou plus »
// quand la liste relue est pleine (on ne sait pas alors combien il y en a au-delà).
//
// L'arrivée des nouveautés est annoncée une seule fois, poliment, par une région `LiveStatus`
// cachée à l'œil (le bouton se voit déjà) : jamais par le focus, qui resterait là où la personne
// lit.
import { layout } from '@ruche/brand'
import { FEED_PAGE_SIZE } from '@ruche/contracts'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import { AvatarStack, type StackMember } from './AvatarStack'
import { Button } from './Button'
import { LiveStatus } from './LiveStatus'
import { Text } from './Text'

/** Les sortes d'éléments du fil qui peuvent arriver. */
type NewsKind = 'project' | 'update'

type Props = {
  /** Combien d'éléments sont arrivés depuis la dernière lecture ; null : rien de neuf. */
  count: number | null
  /** Vrai quand la liste relue est pleine et qu'il y a une suite : « 20 nouveautés ou plus ». */
  more: boolean
  /** Les sortes d'éléments arrivés : le texte parle de projets, de mises à jour, ou de nouveautés. */
  kinds: readonly NewsKind[]
  /** Les auteurs des éléments arrivés (3 au plus, distincts), déjà prêts à dessiner. */
  authors: readonly StackMember[]
  /** Ce qu'il faut faire au toucher : relire le fil (la promesse se termine une fois relu). */
  onPress: () => unknown
  /** La phrase affichée quand il n'y a rien de neuf (« Les nouveaux projets des personnes… »). */
  caption?: string
}

/**
 * Le texte du bouton. Des mises à jour seules : « 2 mises à jour » ; des projets seuls : « 3 nouveaux
 * projets » ; des deux, ou des sortes inconnues : « 4 nouveautés », toujours vrai.
 */
function useNewsLabel(count: number | null, more: boolean, kinds: readonly NewsKind[]) {
  const { t } = useTranslation()
  if (count === null) return null
  const projects = kinds.includes('project')
  const updates = kinds.includes('update')
  const sort = projects && !updates ? 'projects' : updates && !projects ? 'updates' : 'mixed'
  // Au plafond, le nombre affiché est la taille d'une page du fil, suivie de « ou plus ».
  const max = FEED_PAGE_SIZE
  if (more) {
    if (sort === 'projects') return t(($) => $.feed.newProjectsMany, { max })
    if (sort === 'updates') return t(($) => $.feed.newUpdatesMany, { max })
    return t(($) => $.feed.newMixedMany, { max })
  }
  if (sort === 'projects') return t(($) => $.feed.newProjects, { count })
  if (sort === 'updates') return t(($) => $.feed.newUpdates, { count })
  return t(($) => $.feed.newMixed, { count })
}

/**
 * Sur le web : le focus est-il parti ailleurs que dans `place` ? Oui s'il est sur un élément hors
 * d'elle ; non s'il y est encore (le bouton touché) ou s'il est retombé sur toute la page (`body`,
 * le bouton disparu). (Les types de React Native ne décrivent pas la page web.)
 */
const focusMovedAway = (place: unknown) => {
  const page = (globalThis as { document?: { activeElement?: unknown; body?: unknown } }).document
  const active = page?.activeElement
  if (!active || active === page?.body) return false
  return !(place as { contains?: (node: unknown) => boolean } | null)?.contains?.(active)
}

export function NewItemsBanner({ count, more, kinds, authors, onPress, caption }: Props) {
  const label = useNewsLabel(count, more, kinds)
  // La place du bouton. Après un toucher, le bouton disparaît : sur le web, le focus du clavier
  // revient ici (tabIndex -1 : on peut y poser le focus, mais la touche Tab ne s'y arrête pas), au
  // lieu de retomber tout en haut de la page. Sauf si l'écran l'a posé ailleurs pendant `onPress`
  // (le Fil sur ordinateur le donne au titre « Fil », RF ui-5) : la place ne le lui reprend pas.
  const slot = useRef<View>(null)
  const show = async () => {
    await onPress()
    if (Platform.OS === 'web' && !focusMovedAway(slot.current)) slot.current?.focus()
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
        // En verre plutôt qu'en miel : « Publier » reste la seule action miel de l'écran. Les
        // visages des auteurs remplacent l'étincelle ; sans auteur connu, l'étincelle revient.
        <Button
          label={label}
          onPress={() => void show()}
          {...(authors.length > 0
            ? { leading: <AvatarStack members={authors} size="small" /> }
            : { icon: 'sparkle' as const })}
          variant="glass"
          size="compact"
        />
      ) : caption ? (
        <Text variant="callout" tone="secondary">
          {caption}
        </Text>
      ) : null}
      {/* Toujours montée, vide quand il n'y a rien de neuf : la région n'annonce que ce qui change,
          et le même texte relu (une relecture du fil qui trouve les mêmes nouveautés) se tait. */}
      <LiveStatus message={label ?? ''} visible={false} />
    </View>
  )
}
