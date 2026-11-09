// La section « Outils : les feuilles de la page d'un outil » du catalogue (tranche R6b, U5) : la
// feuille des catégories (CategoryFilterSheet) et la feuille d'un outil (ToolEditSheet), dans tous
// leurs états. Une feuille vient par-dessus l'écran : chaque état s'ouvre par son bouton, pour de
// vrai (Échap, le voile, « Fermer », le focus rendu au bouton).
// - Catégories : aucune choisie, « Cuisine » choisie, et sans nombres (la recherche).
// - Outil : ajouter un « Autre » (le nom prérempli), créer un outil (vide), modifier un outil
//   (rempli) ; une écriture refusée (« Ce nom est déjà celui d'un outil… » sous le nom) ; une
//   écriture lente (6 s : la feuille refuse de se fermer, une seconde tape n'écrit rien).
//   Modifiée, toute fermeture demande « Abandonner les changements ? ».
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne (la session le monte) : plusieurs
// personnes y travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes des feuilles viennent de l'appli.
import type { ToolAdmit } from '@ruche/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type CategoryFilterChoice, CategoryFilterSheet } from '../screens/CategoryFilterSheet'
import { type ToolEditResult, ToolEditSheet } from '../screens/ToolEditSheet'
import { Button } from '../ui/Button'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Outils : les feuilles de la page d’un outil',
  intro:
    'CategoryFilterSheet : « Toutes les catégories », puis les catégories des projets avec leur nombre ; choisir applique et ferme, seul « Fermer » reste. ToolEditSheet : le nom, la famille, deux descriptions neutres et le site ; modifiée, toute fermeture demande « Abandonner les changements ? » ; pendant l’écriture, rien ne ferme et une seconde tape n’écrit rien.',
  categoriesNone: 'Catégories : aucune choisie',
  categoriesChosen: 'Catégories : « Cuisine » choisie',
  categoriesNoCount: 'Catégories : sans nombres',
  admit: 'Outil : ajouter un « Autre »',
  create: 'Outil : créer',
  edit: 'Outil : modifier',
  refused: 'Outil : nom déjà pris',
  slow: 'Outil : écriture de 6 s',
  chosen: 'Choisi : ',
  none: 'aucune',
  cooking: 'Cuisine',
  animals: 'Animaux',
  games: 'Jeux',
  description: 'Écrit une application web à partir d’une description.',
  descriptionEn: 'Writes a web app from a description.',
}

const en: typeof fr = {
  title: 'Tools: the sheets of a tool page',
  intro:
    'CategoryFilterSheet: “All categories”, then the categories of the projects with their count; choosing applies and closes, only “Close” remains. ToolEditSheet: the name, the family, two neutral descriptions and the site; once modified, every close asks “Discard the changes?”; while saving, nothing closes and a second tap writes nothing.',
  categoriesNone: 'Categories: none chosen',
  categoriesChosen: 'Categories: “Cooking” chosen',
  categoriesNoCount: 'Categories: without counts',
  admit: 'Tool: admit an “other”',
  create: 'Tool: create',
  edit: 'Tool: edit',
  refused: 'Tool: name already taken',
  slow: 'Tool: a 6 s save',
  chosen: 'Chosen: ',
  none: 'none',
  cooking: 'Cooking',
  animals: 'Animals',
  games: 'Games',
  description: 'Écrit une application web à partir d’une description.',
  descriptionEn: 'Writes a web app from a description.',
}

type Labels = typeof fr

/** Les états de la feuille d'un outil : son mode, ses valeurs de départ, et ce que rend l'écriture. */
type EditState = {
  key: string
  label: (l: Labels) => string
  mode: 'admit' | 'create' | 'edit'
  initial: (l: Labels) => Partial<ToolAdmit>
  submit: () => Promise<ToolEditResult>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const lovable = (l: Labels): Partial<ToolAdmit> => ({
  name: 'Lovable',
  family: 'no-code',
  descriptionFr: l.description,
  descriptionEn: l.descriptionEn,
  siteUrl: 'https://lovable.dev/',
})

const EDIT_STATES: EditState[] = [
  {
    key: 'admit',
    label: (l) => l.admit,
    mode: 'admit',
    initial: () => ({ name: 'Teachable Machine' }),
    submit: async () => ({ ok: true }),
  },
  {
    key: 'create',
    label: (l) => l.create,
    mode: 'create',
    initial: () => ({}),
    submit: async () => ({ ok: true }),
  },
  {
    key: 'edit',
    label: (l) => l.edit,
    mode: 'edit',
    initial: lovable,
    submit: async () => ({ ok: true }),
  },
  {
    key: 'refused',
    label: (l) => l.refused,
    mode: 'edit',
    initial: lovable,
    submit: async () => ({ ok: false, error: 'toolNameTaken', field: 'name' }),
  },
  {
    key: 'slow',
    label: (l) => l.slow,
    mode: 'edit',
    initial: lovable,
    submit: async () => {
      await wait(6000)
      return { ok: true }
    },
  },
]

export function ToolPageSheetsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const categories: CategoryFilterChoice[] = [
    { code: 'cooking', name: l.cooking, icon: 'cooking-pot', count: 3 },
    { code: 'animals', name: l.animals, icon: 'paw-print', count: 1 },
    { code: 'games', name: l.games, icon: 'game-controller', count: 12 },
  ]
  const withoutCounts = categories.map(({ count: _count, ...rest }) => rest)
  // Quelle feuille est ouverte (une à la fois) et la catégorie choisie dans la feuille.
  const [open, setOpen] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const close = () => setOpen(null)
  const categorySheets = [
    { key: 'none', label: l.categoriesNone, list: categories, value: category },
    { key: 'chosen', label: l.categoriesChosen, list: categories, value: category ?? 'cooking' },
    { key: 'noCount', label: l.categoriesNoCount, list: withoutCounts, value: category },
  ]
  return (
    <Stack gap="md" align="stretch">
      <Text variant="title2" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Text variant="caption" tone="muted">
        {`${l.chosen}${category ?? l.none}`}
      </Text>
      <Stack direction="row" gap="sm" wrap>
        {categorySheets.map((sheet) => (
          <Button
            key={sheet.key}
            label={sheet.label}
            variant="secondary"
            onPress={() => setOpen(`category-${sheet.key}`)}
          />
        ))}
        {EDIT_STATES.map((state) => (
          <Button
            key={state.key}
            label={state.label(l)}
            variant="secondary"
            onPress={() => setOpen(`edit-${state.key}`)}
          />
        ))}
      </Stack>
      {categorySheets.map((sheet) => (
        <CategoryFilterSheet
          key={sheet.key}
          open={open === `category-${sheet.key}`}
          categories={sheet.list}
          value={sheet.value}
          onChange={(code) => {
            setCategory(code)
            close()
          }}
          onClose={close}
        />
      ))}
      {EDIT_STATES.map((state) => (
        <ToolEditSheet
          key={state.key}
          open={open === `edit-${state.key}`}
          mode={state.mode}
          initial={state.initial(l)}
          onSubmit={state.submit}
          onClose={close}
        />
      ))}
    </Stack>
  )
}
