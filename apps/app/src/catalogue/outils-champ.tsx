// La section « Le champ des outils et le catalogue » du catalogue (tranche R6b, « Choisir ses
// outils ») : le champ des outils (ToolField) quand ses suggestions viennent du catalogue des outils
// (`tools/match.ts`), dans tous ses états :
// - catalogue lu, « clau » tapé : Claude et Claude Code, avec leur lettre, leur famille et leur
//   nombre de projets ;
// - catalogue lu, « Teachable Machine » tapé : « Ajouter « … » comme autre outil » ;
// - un « Autre » choisi : sa pastille marquée « Autre », et l'aide sous le champ ;
// - catalogue en chargement (ou en panne) : la ligne « Ajouter « … » » neutre, aucune marque ;
// - une erreur sous le champ (« 10 outils au plus. ») ;
// - `allowOther` faux (« Rattacher à un outil » de l'administration) : seuls les outils du
//   catalogue, aucune ligne « Ajouter ».
// Le premier exemple se manipule : taper « chat gpt » (un alias de ChatGPT : aucun « Autre »
// proposé), « Teachable Machine », choisir, retirer.
// Fichier à part de CatalogueScreen.tsx, qui l'importera en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes des composants viennent de l'appli.
import {
  type CatalogueTool,
  FAVORITE_TOOLS_MAX,
  PROJECT_TOOLS_MAX,
  type ToolFamily,
} from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isCatalogueName, matchTools } from '../tools/match'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ToolField, type ToolFieldLabels } from '../ui/ToolField'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le champ des outils et le catalogue',
  intro:
    'Les suggestions viennent du catalogue des outils : chacune avec sa lettre, sa famille et son nombre de projets ; les accents, les majuscules et les espaces ne comptent pas, et un alias propose l’outil du catalogue. Un nom absent s’ajoute comme « autre outil », marqué « Autre », avec une aide sous le champ. Tant que le catalogue n’est pas lu, la ligne « Ajouter » reste neutre et rien n’est marqué.',
  live: 'À manipuler : taper « chat gpt », « clau » ou « Teachable Machine », choisir, retirer',
  ready: 'Catalogue lu : « clau » tapé',
  addOther: 'Catalogue lu : un nom absent, ajouté comme autre outil',
  other: 'Un « Autre » choisi : sa marque, et l’aide sous le champ',
  loading: 'Catalogue en chargement ou en panne : ligne neutre, aucune marque',
  error: 'Une erreur sous le champ (profil : 10 outils au plus)',
  catalogueOnly:
    'Outils du catalogue seulement (« Rattacher à un outil ») : « clau » tapé, aucune ligne « Ajouter »',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'The tools field and the catalogue',
  intro:
    'Suggestions come from the tools catalogue: each with its letter, its family and its number of projects; accents, capitals and spaces do not count, and an alias offers the catalogue tool. A missing name is added as an “other tool”, marked “Other”, with a hint under the field. Until the catalogue is read, the “Add” row stays neutral and nothing is marked.',
  live: 'Try it: type “chat gpt”, “clau” or “Teachable Machine”, choose, remove',
  ready: 'Catalogue read: “clau” typed',
  addOther: 'Catalogue read: a missing name, added as an other tool',
  other: 'An “Other” chosen: its mark, and the hint under the field',
  loading: 'Catalogue loading or failed: neutral row, no mark',
  error: 'An error under the field (profile: 10 tools at most)',
  catalogueOnly: 'Catalogue tools only (“Link to a tool”): “clau” typed, no “Add” row',
  day: 'day',
  night: 'night',
}

/** Un outil du catalogue, comme GET /v1/tools le rendrait. */
const tool = (
  name: string,
  family: ToolFamily,
  projectCount: number,
  aliases: string[] = [],
): CatalogueTool => ({
  slug: name.toLowerCase().replace(/ /g, '-'),
  name,
  family,
  aliases,
  projectCount,
})

/** Le catalogue d'exemple, du plus utilisé au moins utilisé, comme l'API le range. */
const CATALOGUE: CatalogueTool[] = [
  tool('Claude', 'assistant', 41, ['Claude AI']),
  tool('ChatGPT', 'assistant', 30, ['Chat GPT', 'GPT']),
  tool('Claude Code', 'development', 12),
  tool('Python', 'development', 9),
  tool('Midjourney', 'creation', 7),
  tool('Expo', 'development', 6),
  tool('Home Assistant', 'smart-home', 3),
  tool('Arduino', 'hardware', 2),
  tool('Make', 'automation', 0),
]

const isOther = (name: string) => !isCatalogueName(CATALOGUE, name)
const noop = () => {}

/** Les textes du champ, tirés de l'appli : ceux qu'un écran lui donnera (R6b). */
const useLabels = (): ToolFieldLabels => {
  const { t } = useTranslation()
  // « 41 projets », ou « Aucun projet pour l'instant » (« 0 projet » serait faux en français).
  const projects = (count: number) =>
    count === 0 ? t(($) => $.tools.noProjects) : t(($) => $.tools.projects, { count })
  return {
    search: t(($) => $.project.form.toolSearch),
    suggestions: t(($) => $.project.form.toolSuggestions),
    chosen: t(($) => $.project.form.toolsChosen),
    counter: (count, max) => ({
      shown: t(($) => $.project.form.toolsCount, { count, max }),
      spoken: t(($) => $.project.form.toolsCountSpoken, { count, max }),
    }),
    uses: (count) => t(($) => $.project.form.toolUses, { count }),
    suggestion: (name, count) => t(($) => $.project.form.toolSuggestion, { name, count }),
    add: (name) => t(($) => $.project.form.addTool, { name }),
    remove: (name) => t(($) => $.project.form.removeTool, { name }),
    detail: (family, count) => {
      if (family === null) return projects(count)
      const code = family as ToolFamily
      return t(($) => $.tools.detail, {
        family: t(($) => $.tools.family[code]),
        projects: projects(count),
      })
    },
    addOther: (name) => t(($) => $.project.form.addOtherTool, { name }),
    otherBadge: t(($) => $.tool.otherBadge),
    otherSpoken: (name) => t(($) => $.tool.otherSpoken, { name }),
    otherHint: t(($) => $.project.form.otherToolsHint),
  }
}

export function ToolFieldCatalogue() {
  const { i18n, t } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const labels = useLabels()
  const label = t(($) => $.project.form.tools)
  const schemes = ['day', 'night'] as const
  /** Un champ figé, texte déjà tapé (liste ouverte) : une capture ne tape pas. */
  const fixed = ({
    values = [],
    typed,
    ready = true,
    allowOther = true,
    error,
    limit = PROJECT_TOOLS_MAX,
  }: {
    values?: string[]
    typed?: string
    ready?: boolean
    allowOther?: boolean
    error?: string
    limit?: number
  }) => {
    const match = matchTools(ready ? CATALOGUE : [], typed ?? '', values)
    return (
      <ToolField
        label={label}
        values={values}
        onChange={noop}
        suggestions={match.suggestions}
        onQuery={noop}
        limit={limit}
        labels={labels}
        known={match.known}
        catalogueReady={ready}
        isOther={isOther}
        allowOther={allowOther}
        error={error}
        {...(typed ? { initialText: typed } : null)}
      />
    )
  }
  const tooMany = t(($) => $.profile.errors.tooManyTools, { max: FAVORITE_TOOLS_MAX })
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LiveField labels={labels} label={label} />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.ready} — ${l[scheme]}`}>
              {fixed({ values: ['Expo'], typed: 'clau' })}
            </Example>
            <Example caption={`${l.addOther} — ${l[scheme]}`}>
              {fixed({ values: ['Claude'], typed: 'Teachable Machine' })}
            </Example>
            <Example caption={`${l.other} — ${l[scheme]}`}>
              {fixed({ values: ['Claude', 'Teachable Machine'] })}
            </Example>
            <Example caption={`${l.loading} — ${l[scheme]}`}>
              {fixed({ values: ['Claude', 'Teachable Machine'], typed: 'Scratch', ready: false })}
            </Example>
            <Example caption={`${l.error} — ${l[scheme]}`}>
              {fixed({
                values: ['Claude', 'Python'],
                error: tooMany,
                limit: FAVORITE_TOOLS_MAX,
              })}
            </Example>
            <Example caption={`${l.catalogueOnly} — ${l[scheme]}`}>
              {fixed({ typed: 'clau', allowOther: false, limit: 1 })}
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple qui se manipule : les outils et la recherche vivent ici, comme dans un écran. */
function LiveField({ labels, label }: { labels: ToolFieldLabels; label: string }) {
  const [values, setValues] = useState(['Claude'])
  const [query, setQuery] = useState('')
  const match = matchTools(CATALOGUE, query, values)
  return (
    <ToolField
      label={label}
      values={values}
      onChange={setValues}
      suggestions={match.suggestions}
      onQuery={setQuery}
      limit={PROJECT_TOOLS_MAX}
      labels={labels}
      known={match.known}
      catalogueReady
      isOther={isOther}
    />
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
