// Une rangée de « Mes retours », dans les réglages « Les Éclaireuses » (R20, planche R20-Reglages) :
// l'un des retours de l'Éclaireuse, vu par elle. L'icône de la sorte, la sorte (« Bug ») et sa
// gravité (« Bloquant », en encre), depuis quand, la mission à laquelle il répond, le texte, le
// statut en pastille (Corrigé miel plein, Prévu crème, les autres neutres) et, pour un retour
// corrigé, la note que l'administrateur lui a laissée. Le menu « ⋯ » au bout de la première ligne
// porte ses actions (« Supprimer ce retour »).
//
// Le texte est celui de l'Éclaireuse, écrit tel quel (jamais en Markdown, choix 15 du plan R20).
// Elle n'a pas d'autre page où le relire : il se replie après quelques lignes, avec « Lire la
// suite » (`ReadMore`), au lieu d'être coupé pour de bon comme dans la page de tri.
//
// La rangée n'ouvre rien : elle se pose dans un `ListGroup list` (une liste lue comme telle), et
// chaque rangée est un élément de cette liste (rôle `listitem` sur le web). La sorte et le statut
// reprennent les pastilles de la page de tri (`SeverityPill`, `StatusLabel`) : le même statut a la
// même couleur pour l'administrateur et pour l'Éclaireuse.
import { borders, layout, radii, space } from '@ruche/brand'
import { type Ref, useId } from 'react'
import { Platform, View } from 'react-native'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'
import { excerpt } from './CommentAction'
import { Icon, type IconName } from './Icon'
import { ReadMore } from './ReadMore'
import { RelativeTime } from './RelativeTime'
import { type ScoutStatusLook, SeverityPill, StatusLabel } from './ScoutTriageRow'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La sorte (« Bug ») et son icône. */
  kind: { label: string; icon: IconName }
  /** La gravité (« Gênant ») ; `strong` : en encre (« Bloquant »). Absente pour une Idée ou un J'adore. */
  severity?: { label: string; strong: boolean } | undefined
  /** Le texte du retour, tel qu'écrit. */
  text: string
  /** La date d'envoi, au format ISO du contrat. */
  date: string
  /** La mission à laquelle il répond, déjà mise en phrase (« Mission : Publie un projet… »). */
  mission?: string | undefined
  status: ScoutStatusLook
  /** La note de l'administrateur sur un retour corrigé, déjà mise entre guillemets. */
  note?: string | undefined
  /** Le menu « ⋯ » : son nom lu (« Actions du retour ») et ses actions. Sans lui, pas de menu. */
  menu?: { label: string; items: ActionMenuItem[] } | undefined
  /** Le bouton « ⋯ », pour y poser le focus quand la rangée d'à côté disparaît. */
  menuRef?: Ref<View> | undefined
  /** L'heure qu'il est, pour figer la date (catalogue, tests). */
  now?: Date
}

/** Le texte se replie après quatre lignes (la planche en montre deux ou trois). */
const TEXT_LINES = 4

export function ScoutReportRow({
  kind,
  severity,
  text,
  date,
  mission,
  status,
  note,
  menu,
  menuRef,
  now,
}: Props) {
  const { colors } = useTheme()
  // L'identifiant du texte (web) : le bouton « ⋯ » le désigne comme sa description, pour qu'on
  // entende de quel retour il s'agit (« Actions du retour », puis le début du texte).
  const textId = useId()
  return (
    <View
      accessibilityRole={Platform.OS === 'web' ? ('listitem' as 'none') : undefined}
      style={{ flexDirection: 'row', gap: space.md, padding: space.md }}
    >
      {/* L'icône de la sorte, dans un rond : un repère pour l'œil, la sorte est écrite à côté. */}
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: layout.touchTarget - space.sm,
          height: layout.touchTarget - space.sm,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: borders.hairline,
          borderColor: colors.outline,
          backgroundColor: colors.honeySoft,
        }}
      >
        <Icon name={kind.icon} size={18} tone="muted" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        {/* La sorte, sa gravité et la date ; le « ⋯ » au bout. À 320 points ou à texte agrandi, la
            date passe à la ligne au lieu de pousser le menu hors de la rangée. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: layout.touchTarget,
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: space.sm,
              rowGap: space.xxs,
            }}
          >
            <Text variant="callout" weight={700}>
              {kind.label}
            </Text>
            {severity ? <SeverityPill {...severity} /> : null}
            <RelativeTime date={date} {...(now ? { now } : null)} />
          </View>
          {menu ? (
            <ActionMenu
              ref={menuRef}
              label={menu.label}
              items={menu.items}
              variant="bare"
              align="end"
              describedById={textId}
              hint={excerpt(text.replace(/\s+/g, ' ').trim())}
            />
          ) : null}
        </View>
        {mission ? (
          <Text variant="caption" weight={700} tone="accent" breakAnywhere>
            {mission}
          </Text>
        ) : null}
        <ReadMore lines={TEXT_LINES}>
          {(numberOfLines) => (
            <Text
              variant="callout"
              nativeID={textId}
              breakAnywhere
              {...(numberOfLines === undefined ? null : { numberOfLines })}
            >
              {text}
            </Text>
          )}
        </ReadMore>
        <StatusLabel {...status} />
        {note ? (
          // La note de l'administrateur : une bulle crème sous le statut, avec son icône.
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radii.tile,
              backgroundColor: colors.honeySoft,
              maxWidth: '100%',
            }}
          >
            <View style={{ flexShrink: 0 }}>
              <Icon name="chat-circle" size={16} tone="muted" />
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text variant="callout" breakAnywhere>
                {note}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}
