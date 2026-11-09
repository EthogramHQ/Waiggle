// Les textes du champ des outils (`ui/ToolField`), tirés des traductions : partagés par la feuille
// « Catégorie et outils » d'un projet (`screens/ProjectCategorySheet.tsx`) et par les outils favoris
// de « Mon profil » (`screens/ProfileScreen.tsx`), qui choisissent leurs outils dans le même
// catalogue (tranche R6b). Un seul endroit : un libellé changé l'est pour les deux champs.
import type { ProjectVisibility, ToolFamily } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import type { ToolFieldLabels } from '../ui/ToolField'

/**
 * Hook : le nombre de projets d'un outil ou d'une catégorie, dit comme partout : « 41 projets », ou
 * « Aucun projet pour l'instant » à zéro (« 0 projet » serait faux en français, ui-S1 de R6b). Un
 * seul endroit pour la page d'un outil et pour les catégories de la modération ; le texte des
 * catégories (« Sous le nom d'une catégorie ») reste le même au-dessus de zéro.
 */
export const useProjectsOrNone = () => {
  const { t } = useTranslation()
  return (count: number) =>
    count === 0 ? t(($) => $.tools.noProjects) : t(($) => $.tools.projects, { count })
}

/**
 * Hook : les textes du champ des outils. Sous un nom proposé, sa famille et son nombre de projets
 * (« Assistant IA · 41 projets », ou « Aucun projet pour l'instant » : « 0 projet » serait faux en
 * français). `ToolSuggestion.family` porte le code de la famille (« assistant »), traduit ici.
 *
 * @param visibility qui verra les outils choisis : l'aide sous un « Autre » n'est pas la même pour
 * un projet privé, dont les outils ne sont montrés à personne ni relus par les administrateurs
 * (jur-T3). Le profil, lu par tous les membres, passe `public`.
 */
export const useToolLabels = (visibility: ProjectVisibility): ToolFieldLabels => {
  const { t } = useTranslation()
  const projects = useProjectsOrNone()
  return {
    search: t(($) => $.project.form.toolSearch),
    suggestions: t(($) => $.project.form.toolSuggestions),
    chosen: t(($) => $.project.form.toolsChosen),
    counter: (count, max) => ({
      shown: t(($) => $.project.form.toolsCount, { count, max }),
      spoken: t(($) => $.project.form.toolsCountSpoken, { count, max }),
    }),
    uses: (count) => t(($) => $.project.form.toolUses, { count }),
    // Le nom lu dit la ligne affichée : « Claude, Assistant IA · 41 projets », comme les lignes de
    // « Tous les outils » (`tools.withCount`, ui-C3) ; sans elle, le nombre seul.
    suggestion: (name, count, detail) =>
      detail === undefined
        ? t(($) => $.project.form.toolSuggestion, { name, count })
        : t(($) => $.tools.withCount, { label: name, projects: detail }),
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
