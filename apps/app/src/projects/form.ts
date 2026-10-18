// Règles du formulaire de projet (publier ou modifier) : transforme ce que le membre a saisi en
// données à envoyer, ou en messages d'erreur par champ. Comme pour le profil, les règles viennent
// du schéma ProjectInput de @ruche/contracts : l'appli et l'API appliquent exactement les mêmes.
import {
  type Project,
  ProjectInput,
  type ProjectStatus,
  type ProjectVisibility,
  type TimeSpent,
} from '@ruche/contracts'
import { parseTools } from '../profile/form'

/** Le formulaire tel qu'affiché : le lien et les outils sont des textes libres. */
export type ProjectForm = {
  title: string
  pitch: string
  description: string
  status: ProjectStatus
  visibility: ProjectVisibility
  demoUrl: string
  tools: string
  timeSpent: TimeSpent | null
  prompts: string[]
}

/** Un formulaire vide, avec les valeurs par défaut : une idée, visible par les membres. */
export const emptyProjectForm: ProjectForm = {
  title: '',
  pitch: '',
  description: '',
  status: 'idea',
  visibility: 'public',
  demoUrl: '',
  tools: '',
  timeSpent: null,
  prompts: [],
}

/** Le formulaire pré-rempli avec un projet existant, pour le modifier. */
export const formFromProject = (project: Project): ProjectForm => ({
  title: project.title,
  pitch: project.pitch,
  description: project.description,
  status: project.status,
  visibility: project.visibility,
  demoUrl: project.demoUrl ?? '',
  tools: project.tools.map((tool) => tool.label).join(', '),
  timeSpent: project.timeSpent,
  prompts: project.prompts,
})

export type ProjectFormErrors = {
  title?: 'titleRequired' | 'titleTooLong' | 'invalidCharacters'
  pitch?: 'pitchRequired' | 'pitchTooLong' | 'invalidCharacters'
  description?: 'descriptionTooLong' | 'invalidCharacters'
  demoUrl?: 'demoUrlInvalid'
  tools?: 'tooManyTools' | 'toolTooLong' | 'invalidCharacters'
  prompts?: 'tooManyPrompts' | 'promptTooLong' | 'invalidCharacters'
}

export const toProjectChanges = (
  form: ProjectForm,
): { ok: true; changes: ProjectInput } | { ok: false; errors: ProjectFormErrors } => {
  const demoUrl = form.demoUrl.trim()
  const parsed = ProjectInput.safeParse({
    ...form,
    demoUrl: demoUrl === '' ? null : demoUrl, // case vide : pas de démo
    tools: parseTools(form.tools),
  })
  if (parsed.success) return { ok: true, changes: parsed.data }

  const errors: ProjectFormErrors = {}
  for (const issue of parsed.error.issues) {
    // issue.path : où est le problème (['title'], ['tools', 3]…) ; issue.code : lequel.
    const [field, index] = issue.path
    const tooBig = issue.code === 'too_big'
    // « custom » : la règle maison des caractères invisibles (voir contracts/src/text.ts).
    const invisible = issue.code === 'custom'
    if (field === 'title') {
      errors.title = invisible ? 'invalidCharacters' : tooBig ? 'titleTooLong' : 'titleRequired'
    }
    if (field === 'pitch') {
      errors.pitch = invisible ? 'invalidCharacters' : tooBig ? 'pitchTooLong' : 'pitchRequired'
    }
    if (field === 'description') {
      errors.description = invisible ? 'invalidCharacters' : 'descriptionTooLong'
    }
    if (field === 'demoUrl') errors.demoUrl = 'demoUrlInvalid'
    // Sans index, le problème concerne la liste entière (trop d'éléments) ; avec, un élément.
    if (field === 'tools') {
      errors.tools = invisible
        ? 'invalidCharacters'
        : index === undefined
          ? 'tooManyTools'
          : 'toolTooLong'
    }
    if (field === 'prompts') {
      errors.prompts = invisible
        ? 'invalidCharacters'
        : index === undefined
          ? 'tooManyPrompts'
          : 'promptTooLong'
    }
  }
  return { ok: false, errors }
}
