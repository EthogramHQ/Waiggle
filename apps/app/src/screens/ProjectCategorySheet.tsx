// La seconde feuille de publication, « Catégorie et outils » (R6a, planche R6-Publier-Outils) :
// elle s'ouvre par-dessus « Nouveau projet » (ou « Modifier le projet ») depuis les lignes
// « Catégorie », « Seconde » et « Outils » du formulaire (`ProjectFormFields`).
//
// Dedans : les seize catégories (`CategoryPicker`, une principale puis une seconde facultative), et
// les outils (`ToolField`) : ceux que les membres citent déjà, avec leur nombre de projets, et tout
// nom nouveau, ajouté tel quel.
//
// Chaque geste remonte tout de suite à la feuille de dessous (`onChange`) : il n'y a rien à
// « valider ». « OK » ferme, et Échap, le voile ou le retour d'Android aussi, en gardant les choix
// (relecture du plan, ui-I10). La pile des feuilles de `Sheet` fait que ces gestes ne ferment que
// celle-ci, jamais la feuille de publication dessous.
import { PROJECT_TOOLS_MAX, type ProjectCategory } from '@ruche/contracts'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoryOptions } from '../projects/categories'
import { useTools } from '../tools/api'
import { CategoryPicker } from '../ui/CategoryPicker'
import { type Focusable, moveReaderTo } from '../ui/focus'
import { Sheet } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { ToolField, type ToolFieldLabels, type ToolSuggestion } from '../ui/ToolField'

/** Ce que la feuille fait choisir : les deux catégories et les outils, dans l'ordre. */
export type CategoriesAndTools = {
  primary: ProjectCategory | null
  secondary: ProjectCategory | null
  tools: string[]
}

type Props = CategoriesAndTools & {
  open: boolean
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

/** Le nombre d'outils proposés à la fois : de quoi choisir sans faire défiler une longue liste. */
const SUGGESTIONS_SHOWN = 8

export function ProjectCategorySheet({
  open,
  primary,
  secondary,
  tools,
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
      {/* Le contenu n'existe que feuille ouverte (un Modal fermé ne rend rien) : la liste des
          outils n'est demandée qu'à ce moment-là. */}
      <Choosing primary={primary} secondary={secondary} tools={tools} onChange={onChange} />
    </Sheet>
  )
}

/** Le contenu de la feuille : les catégories, puis les outils. */
function Choosing({
  primary,
  secondary,
  tools,
  onChange,
}: CategoriesAndTools & { onChange: Props['onChange'] }) {
  const { t } = useTranslation()
  // Les outils déjà cités par les projets des membres, du plus cité au moins cité (GET /v1/tools).
  // Tant qu'ils ne sont pas là (ou si la lecture échoue), on peut quand même ajouter un nom tapé.
  const known = useTools().data?.tools ?? []
  const [query, setQuery] = useState('')
  const wanted = query.toLowerCase()
  const suggestions: ToolSuggestion[] = known
    .filter((tool) => tool.label.toLowerCase().includes(wanted))
    .slice(0, SUGGESTIONS_SHOWN)
    .map((tool) => ({ name: tool.label, uses: tool.projectCount }))

  const labels: ToolFieldLabels = {
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
  }

  return (
    <Stack gap="xl">
      <CategoryPicker
        label={t(($) => $.project.form.category)}
        hint={t(($) => $.project.form.categoryRule)}
        options={categoryOptions(t)}
        primary={primary}
        secondary={secondary}
        onChange={(choice) => onChange({ ...choice, tools })}
        rankLabels={{
          primary: (category) => t(($) => $.project.form.categoryRank1, { category }),
          secondary: (category) => t(($) => $.project.form.categoryRank2, { category }),
        }}
      />
      <ToolField
        label={t(($) => $.project.form.tools)}
        values={tools}
        onChange={(next) => onChange({ primary, secondary, tools: next })}
        suggestions={suggestions}
        onQuery={setQuery}
        limit={PROJECT_TOOLS_MAX}
        labels={labels}
      />
    </Stack>
  )
}
