// La seconde feuille de publication, « Catégorie et outils » (R6a, planche R6-Publier-Outils) :
// elle s'ouvre par-dessus « Nouveau projet » (ou « Modifier le projet ») depuis les lignes
// « Catégorie », « Seconde » et « Outils » du formulaire (`ProjectFormFields`).
//
// Dedans : les catégories (`CategoryPicker`, une principale puis une seconde facultative), et les
// outils (`ToolField`). Chaque geste remonte tout de suite à la feuille de dessous (`onChange`) : il
// n'y a rien à « valider ». « OK » ferme, et Échap, le voile ou le retour d'Android aussi, en gardant
// les choix (relecture du plan, ui-I10). La pile des feuilles de `Sheet` fait que ces gestes ne
// ferment que celle-ci, jamais la feuille de publication dessous.
//
// Depuis R6b (scénario « Choisir ses outils », décisions 7, 11 et 15 de la relecture du plan) :
// - les catégories viennent de l'API (`useCategories`), avec celles qu'un administrateur a créées :
//   pendant la lecture, une attente à leur place ; en panne, un message et « Réessayer ». Les outils
//   restent utilisables pendant ce temps ;
// - sous la catégorie « Autre », une aide dit que les administrateurs pourront ranger le projet ;
// - les outils viennent du catalogue (`useTools`), cherchés par nom et par alias (`matchTools`) ; un
//   nom absent s'ajoute « comme autre outil », marqué, avec une aide qui dépend de la visibilité du
//   projet : relu par les administrateurs, ou, pour un projet privé, montré à personne et pas relu.
import {
  type Category,
  OTHER_CATEGORY,
  PROJECT_TOOLS_MAX,
  type ProjectCategory,
  type ProjectVisibility,
  type ToolFamily,
} from '@ruche/contracts'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCategories } from '../categories/api'
import { categoryOptions } from '../projects/categories'
import { useTools } from '../tools/api'
import { isCatalogueName, matchTools } from '../tools/match'
import { CategoryPicker } from '../ui/CategoryPicker'
import {
  type Focusable,
  focusTarget,
  focusWithoutScroll,
  holdsFocus,
  moveReaderTo,
} from '../ui/focus'
import { Notice } from '../ui/Notice'
import { Sheet } from '../ui/Sheet'
import { SkeletonCard } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { ToolField, type ToolFieldLabels } from '../ui/ToolField'

/** Ce que la feuille fait choisir : les deux catégories et les outils, dans l'ordre. */
export type CategoriesAndTools = {
  primary: ProjectCategory | null
  secondary: ProjectCategory | null
  tools: string[]
}

type Props = CategoriesAndTools & {
  open: boolean
  /**
   * La visibilité du projet (R6b) : l'aide sous un « Autre » n'est pas la même pour un projet privé,
   * dont les outils ne sont montrés à personne ni relus par les administrateurs (jur-T3).
   */
  visibility: ProjectVisibility
  /** Le nouveau choix, après chaque geste (une case cochée, un outil ajouté ou retiré). */
  onChange: (next: CategoriesAndTools) => void
  /** « OK », Échap, le voile ou le retour d'Android : la feuille se ferme, les choix restent. */
  onClose: () => void
  /**
   * La ligne du formulaire qui a ouvert la feuille (« Catégorie », « Seconde » ou « Outils ») : le
   * lecteur d'écran du téléphone y revient à la fermeture, sans repasser par la tête de la feuille
   * de dessous (ui-I10). Sur le web, `Sheet` rend déjà le focus à l'élément qui l'avait à l'ouverture.
   */
  returnFocusRef?: RefObject<Focusable | null>
}

export function ProjectCategorySheet({
  open,
  primary,
  secondary,
  tools,
  visibility,
  onChange,
  onClose,
  returnFocusRef,
}: Props) {
  const { t } = useTranslation()

  // À la fermeture (quelle que soit la voie), le lecteur d'écran du téléphone revient à la ligne
  // d'origine. `wasOpen` : une boîte qui se souvient de l'état d'avant, pour ne réagir qu'au passage
  // d'ouverte à fermée (pas au premier affichage, feuille fermée).
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open) moveReaderTo(returnFocusRef?.current)
    wasOpen.current = open
  }, [open, returnFocusRef])

  return (
    <Sheet
      open={open}
      title={t(($) => $.project.form.categoriesAndTools)}
      onClose={onClose}
      action={{ label: t(($) => $.project.form.ok), onPress: onClose }}
    >
      {/* Le contenu n'existe que feuille ouverte (un Modal fermé ne rend rien) : les catégories et
          le catalogue des outils ne sont demandés qu'à ce moment-là (puis gardés en cache). */}
      <Choosing
        primary={primary}
        secondary={secondary}
        tools={tools}
        visibility={visibility}
        onChange={onChange}
      />
    </Sheet>
  )
}

/** Le contenu de la feuille : les catégories, puis les outils. */
function Choosing({
  primary,
  secondary,
  tools,
  visibility,
  onChange,
}: CategoriesAndTools & Pick<Props, 'visibility' | 'onChange'>) {
  const { t } = useTranslation()
  return (
    <Stack gap="xl">
      <Categories
        primary={primary}
        secondary={secondary}
        onChange={(choice) => onChange({ ...choice, tools })}
      />
      <Tools
        values={tools}
        visibility={visibility}
        label={t(($) => $.project.form.tools)}
        onChange={(next) => onChange({ primary, secondary, tools: next })}
      />
    </Stack>
  )
}

type Choice = Pick<CategoriesAndTools, 'primary' | 'secondary'>

/**
 * Les catégories, lues de l'API : une attente pendant la première lecture, un message et
 * « Réessayer » en panne, puis les cases. Après « Réessayer », le message reste à l'écran pendant
 * la relecture (le focus ne quitte pas le bouton touché) ; les catégories arrivées, le focus va à
 * la première case, au lieu de retomber en haut de la page avec le bouton disparu.
 */
function Categories({
  primary,
  secondary,
  onChange,
}: Choice & { onChange: (choice: Choice) => void }) {
  const { t } = useTranslation()
  const query = useCategories()
  const list = query.data?.categories
  // La place des catégories : on y cherche, catégories arrivées, la première case à focaliser.
  const placeRef = useRef<Focusable>(null)
  // « Réessayer » a été touché au clavier (le focus était dans cette place) : il faudra y rendre
  // le focus quand les catégories arrivent. Une boîte (useRef) : la retenir ne redessine rien.
  const retried = useRef(false)

  useEffect(() => {
    if (!list || !retried.current) return
    retried.current = false
    // Seulement si personne n'a déplacé le focus entre-temps : il est encore dans la place, ou il
    // est retombé sur la page avec le bouton « Réessayer » disparu.
    if (holdsFocus(placeRef.current) || focusFell()) {
      focusWithoutScroll(focusTarget(placeRef.current))
    }
  }, [list])

  // React Query v5 : relire après une panne efface l'erreur (la lecture repasse « en attente »). Le
  // nombre de pannes (`errorUpdateCount`) dit qu'il y en a eu une : le message reste alors affiché
  // pendant la relecture, plutôt que de laisser la place à l'attente puis de revenir.
  const failed = !list && (query.isError || (query.errorUpdateCount > 0 && query.isFetching))

  return (
    <Stack ref={placeRef} gap="sm">
      {list ? (
        <>
          <CategoryPicker
            label={t(($) => $.project.form.category)}
            hint={t(($) => $.project.form.categoryRule)}
            options={categoryOptions(list)}
            primary={primary}
            secondary={secondary}
            onChange={onChange}
            rankLabels={{
              primary: (category) => t(($) => $.project.form.categoryRank1, { category }),
              secondary: (category) => t(($) => $.project.form.categoryRank2, { category }),
            }}
          />
          {/* Sous « Autre », choisie en principale ou en seconde : les administrateurs pourront
              ranger le projet dans une catégorie qui lui va (jur-T4). Elle suit les cases, que le
              lecteur d'écran lit juste avant. */}
          {hasOther(list, primary, secondary) ? (
            <Text variant="caption" tone="muted">
              {t(($) => $.project.form.otherCategoryHint)}
            </Text>
          ) : null}
        </>
      ) : failed ? (
        <Notice
          message={t(($) => $.project.form.categoriesError)}
          action={{
            label: t(($) => $.common.retry),
            role: 'button',
            onPress: () => {
              retried.current = true
              // `cancelRefetch: false` : une seconde tape pendant la relecture ne la relance pas.
              void query.refetch({ cancelRefetch: false })
            },
          }}
        />
      ) : (
        <SkeletonCard />
      )}
    </Stack>
  )
}

/** « Autre » est-elle choisie (principale ou seconde) parmi les catégories lues ? */
const hasOther = (
  list: readonly Category[],
  primary: ProjectCategory | null,
  secondary: ProjectCategory | null,
) =>
  list.some((one) => one.code === OTHER_CATEGORY) &&
  (primary === OTHER_CATEGORY || secondary === OTHER_CATEGORY)

/** Sur le web, le focus est-il retombé sur la page (son élément a disparu) ? */
const focusFell = (): boolean => {
  const page = (globalThis as { document?: { activeElement?: unknown; body?: unknown } }).document
  return page !== undefined && (page.activeElement === null || page.activeElement === page.body)
}

/**
 * Les outils, cherchés dans le catalogue (GET /v1/tools). Tant que le catalogue n'est pas lu
 * (chargement ou panne), on peut quand même ajouter un nom tapé, sans le marquer « Autre » : on ne
 * sait pas encore s'il en est un.
 */
function Tools({
  values,
  visibility,
  label,
  onChange,
}: {
  values: string[]
  visibility: ProjectVisibility
  label: string
  onChange: (next: string[]) => void
}) {
  const catalogue = useTools().data?.tools
  const [query, setQuery] = useState('')
  const match = matchTools(catalogue ?? [], query, values)
  const labels = useToolLabels(visibility)
  return (
    <ToolField
      label={label}
      values={values}
      onChange={onChange}
      suggestions={match.suggestions}
      onQuery={setQuery}
      limit={PROJECT_TOOLS_MAX}
      labels={labels}
      known={match.known}
      catalogueReady={catalogue !== undefined}
      isOther={(name) => catalogue !== undefined && !isCatalogueName(catalogue, name)}
    />
  )
}

/**
 * Les textes du champ des outils. Sous un nom proposé, sa famille et son nombre de projets
 * (« Assistant IA · 41 projets », ou « Aucun projet pour l'instant » : « 0 projet » serait faux en
 * français). `ToolSuggestion.family` porte le code de la famille (« assistant »), traduit ici.
 */
const useToolLabels = (visibility: ProjectVisibility): ToolFieldLabels => {
  const { t } = useTranslation()
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
    // Un projet privé : ses « Autre » ne sont montrés à personne et ne sont pas relus (jur-T3).
    otherHint:
      visibility === 'private'
        ? t(($) => $.project.form.otherToolsHintPrivate)
        : t(($) => $.project.form.otherToolsHint),
  }
}
