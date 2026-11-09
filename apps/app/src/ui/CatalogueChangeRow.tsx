// Une ligne de « Changements récents » (tranche R6b, en bas des pages « Outils » et « Catégories »
// de la Modération) : qui a changé quoi au catalogue, en une phrase (« Nora Benali a rattaché
// « Make (le site) » à Make »), puis quand (« il y a 2 h »). Une petite icône par sorte de geste
// aide à parcourir la liste ; elle est décorative, la phrase dit tout.
//
// Deux règles de la relecture du plan (sec-A1, jur-T2) :
// - un administrateur dont le compte a été supprimé devient « Un ancien administrateur » ;
// - un projet que les membres ne voient plus (privé, retiré, supprimé : `project` vaut null) n'est
//   jamais nommé : la phrase dit « un projet ».
// La ligne écrit elle-même sa phrase à partir de ce que l'API donne (`CatalogueChange`).
import { space } from '@ruche/brand'
import type { CatalogueChange, CatalogueChangeAction } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { RelativeTime } from './RelativeTime'
import { Text } from './Text'

type Props = {
  change: CatalogueChange
  /** L'heure de référence de la date relative : figée au catalogue et dans les tests ; sinon, maintenant. */
  now?: Date | undefined
}

/** L'icône de chaque sorte de geste. */
const ICONS: Record<CatalogueChangeAction, IconName> = {
  tool_admit: 'plus-circle',
  tool_create: 'plus',
  tool_edit: 'pencil-simple',
  tool_merge: 'link',
  tool_dismiss: 'prohibit',
  category_create: 'tag',
  project_recategorize: 'squares-four',
}

export function CatalogueChangeRow({ change, now }: Props) {
  const sentence = useSentence(change)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      {/* L'icône, alignée sur la première ligne de la phrase ; elle ne rétrécit jamais. */}
      <View style={{ flexShrink: 0, paddingTop: space.xxs }}>
        <Icon name={ICONS[change.action]} size={18} tone="muted" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        {/* Un nom d'outil sans espace se coupe n'importe où plutôt que de déborder. */}
        <Text variant="callout" breakAnywhere>
          {sentence}
        </Text>
        <RelativeTime date={change.at} variant="caption" tone="muted" {...(now ? { now } : null)} />
      </View>
    </View>
  )
}

/** La phrase d'une ligne, dans la langue de l'appli. */
function useSentence(change: CatalogueChange): string {
  const { t } = useTranslation()
  const admin = change.admin?.name ?? t(($) => $.moderation.catalogue.formerAdmin)
  // Un outil ou une catégorie manquant (une ligne mal formée) laisse un blanc plutôt qu'un code.
  const tool = change.tool?.name ?? ''
  const category = change.category?.name ?? ''
  switch (change.action) {
    case 'tool_admit':
      return t(($) => $.moderation.catalogue.change.tool_admit, { admin, tool })
    case 'tool_create':
      return t(($) => $.moderation.catalogue.change.tool_create, { admin, tool })
    case 'tool_edit':
      return t(($) => $.moderation.catalogue.change.tool_edit, { admin, tool })
    case 'tool_merge':
      return t(($) => $.moderation.catalogue.change.tool_merge, {
        admin,
        merged: change.mergedName ?? '',
        tool,
      })
    case 'tool_dismiss':
      return t(($) => $.moderation.catalogue.change.tool_dismiss, { admin, tool })
    case 'category_create':
      return t(($) => $.moderation.catalogue.change.category_create, { admin, category })
    case 'project_recategorize':
      return change.project
        ? t(($) => $.moderation.catalogue.change.project_recategorize, {
            admin,
            project: change.project.title,
            category,
          })
        : t(($) => $.moderation.catalogue.change.project_recategorize_hidden, { admin, category })
  }
}
