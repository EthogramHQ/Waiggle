// Règles du formulaire de projet (publier ou modifier) : transforme ce que le membre a saisi en
// données à envoyer, ou en messages d'erreur par champ. Comme pour le profil, les règles viennent
// du schéma ProjectInput de @ruche/contracts : l'appli et l'API appliquent exactement les mêmes.
//
// R6a : le temps passé a disparu ; le formulaire gagne les catégories, « Facile à refaire ? »,
// « Commencé en » et « Qui peut le voir ? » (`audience`). Tout ce fichier est pur : pas d'écran,
// pas de réseau, donc facile à tester.
import {
  DemoUrl,
  type Project,
  type ProjectCategory,
  type ProjectDifficulty,
  ProjectInput,
  type ProjectStatus,
  type ProjectUpdate,
} from '@ruche/contracts'

/**
 * Qui peut voir le projet. L'API garde les codes `public` / `private` ; l'appli dit « Membres de
 * Waiggle » (les seuls à voir un projet « public », jamais le web ouvert) ou « Privé ».
 */
export type ProjectAudience = 'members' | 'private'

/** Le formulaire tel qu'affiché. Les outils sont une liste (le champ à suggestions `ToolField`). */
export type ProjectForm = {
  title: string
  pitch: string
  description: string
  status: ProjectStatus
  audience: ProjectAudience
  demoUrl: string
  tools: string[]
  prompts: string[]
  /** Obligatoire pour publier ; null tant que le membre n'a pas choisi (ou projet d'avant R6a). */
  primaryCategory: ProjectCategory | null
  secondaryCategory: ProjectCategory | null
  difficulty: ProjectDifficulty | null
  /** Le mois de début, `YYYY-MM`. */
  startedOn: string | null
}

/** Un formulaire vide, avec les valeurs par défaut : une idée, visible par les membres. */
export const emptyProjectForm: ProjectForm = {
  title: '',
  pitch: '',
  description: '',
  status: 'idea',
  audience: 'members',
  demoUrl: '',
  tools: [],
  prompts: [],
  primaryCategory: null,
  secondaryCategory: null,
  difficulty: null,
  startedOn: null,
}

/** Le formulaire pré-rempli avec un projet existant, pour le modifier. */
export const formFromProject = (project: Project): ProjectForm => ({
  title: project.title,
  pitch: project.pitch,
  description: project.description,
  status: project.status,
  audience: project.visibility === 'private' ? 'private' : 'members',
  demoUrl: project.demoUrl ?? '',
  tools: project.tools.map((tool) => tool.label),
  prompts: project.prompts,
  primaryCategory: project.primaryCategory,
  secondaryCategory: project.secondaryCategory,
  difficulty: project.difficulty,
  startedOn: project.startedOn,
})

export type ProjectFormErrors = {
  title?: 'titleRequired' | 'titleTooLong' | 'invalidCharacters'
  pitch?: 'pitchRequired' | 'pitchTooLong' | 'invalidCharacters'
  description?: 'descriptionTooLong' | 'invalidCharacters'
  demoUrl?: 'demoUrlInvalid'
  tools?: 'tooManyTools' | 'toolTooLong' | 'invalidCharacters'
  prompts?: 'tooManyPrompts' | 'promptTooLong' | 'invalidCharacters'
  primaryCategory?: 'chooseCategory'
}

/** Un lien vide veut dire « pas de démo » : l'API reçoit `null`. */
const demoUrlOf = (form: ProjectForm) => {
  const demoUrl = form.demoUrl.trim()
  return demoUrl === '' ? null : demoUrl
}

/**
 * Le lien de démo a la forme que l'API acceptera (le schéma `DemoUrl` du contrat) : la feuille
 * coche « Lien valide », et l'aperçu de la carte montre « Tester » (R6a, design-C5). Le site
 * lui-même n'est jamais ouvert (jur-J16).
 */
export const demoUrlLooksValid = (form: ProjectForm): boolean => {
  const demoUrl = form.demoUrl.trim()
  return demoUrl !== '' && DemoUrl.safeParse(demoUrl).success
}

/** Deux listes de textes égales, élément par élément. */
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index])

/** Les champs que le membre a changés, chacun comparé à sa valeur d'ouverture. */
const changedKeys = (initial: ProjectForm, form: ProjectForm) => ({
  title: initial.title !== form.title,
  pitch: initial.pitch !== form.pitch,
  description: initial.description !== form.description,
  status: initial.status !== form.status,
  audience: initial.audience !== form.audience,
  demoUrl: initial.demoUrl !== form.demoUrl,
  tools: !sameList(initial.tools, form.tools),
  prompts: !sameList(initial.prompts, form.prompts),
  categories:
    initial.primaryCategory !== form.primaryCategory ||
    initial.secondaryCategory !== form.secondaryCategory,
  difficulty: initial.difficulty !== form.difficulty,
  startedOn: initial.startedOn !== form.startedOn,
})

/** Vrai si le membre a changé quoi que ce soit : « Enregistrer » s'allume, l'abandon se demande. */
export const isDirty = (initial: ProjectForm, form: ProjectForm): boolean =>
  Object.values(changedKeys(initial, form)).some(Boolean)

/**
 * Le PATCH d'une modification : seulement les champs changés, dans les noms de l'API. Les deux
 * catégories partent toujours ensemble (relecture sec-M2 : l'API refuse une principale égale à la
 * seconde déjà enregistrée, et ne peut pas deviner ce que le membre a voulu). Le temps passé n'existe
 * plus : il n'est jamais envoyé.
 */
export const changedFields = (initial: ProjectForm, form: ProjectForm): ProjectUpdate => {
  const changed = changedKeys(initial, form)
  const update: ProjectUpdate = {}
  if (changed.title) update.title = form.title
  if (changed.pitch) update.pitch = form.pitch
  if (changed.description) update.description = form.description
  if (changed.status) update.status = form.status
  if (changed.audience) update.visibility = form.audience === 'private' ? 'private' : 'public'
  if (changed.demoUrl) update.demoUrl = demoUrlOf(form)
  if (changed.tools) update.tools = form.tools
  if (changed.prompts) update.prompts = form.prompts
  // Une principale ne redevient jamais nulle : sans elle, on n'envoie aucune des deux.
  if (changed.categories && form.primaryCategory) {
    update.primaryCategory = form.primaryCategory
    update.secondaryCategory = form.secondaryCategory
  }
  if (changed.difficulty) update.difficulty = form.difficulty
  if (changed.startedOn) update.startedOn = form.startedOn
  return update
}

/**
 * jur-J8 : un projet d'avant R6a n'a pas de catégorie ; le passer en « Privé » ne doit pas en
 * demander une (restreindre l'audience ne réclame jamais une donnée nouvelle). Tout autre
 * changement, lui, attend la catégorie : la règle ne vaut que si l'audience est le seul champ changé.
 */
const onlyGoesPrivate = (initial: ProjectForm, form: ProjectForm) => {
  const { audience, ...others } = changedKeys(initial, form)
  return (
    initial.primaryCategory === null &&
    initial.audience === 'members' &&
    form.audience === 'private' &&
    audience &&
    !Object.values(others).some(Boolean)
  )
}

/**
 * Vérifie le formulaire avec le schéma du contrat. Sans `initial` (publier), rend un ProjectInput
 * prêt pour POST /v1/projects. Avec `initial` (modifier), rend un ProjectUpdate (le PATCH des seuls
 * champs changés), et accepte le passage en « Privé » d'un projet sans catégorie (jur-J8).
 */
export function toProjectChanges(
  form: ProjectForm,
): { ok: true; changes: ProjectInput } | { ok: false; errors: ProjectFormErrors }
export function toProjectChanges(
  form: ProjectForm,
  initial: ProjectForm,
): { ok: true; changes: ProjectUpdate } | { ok: false; errors: ProjectFormErrors }
export function toProjectChanges(
  form: ProjectForm,
  initial?: ProjectForm,
): { ok: true; changes: ProjectUpdate } | { ok: false; errors: ProjectFormErrors } {
  const waived = initial !== undefined && onlyGoesPrivate(initial, form)
  // Le schéma exige une catégorie : sans elle on valide avec une catégorie d'emprunt (jamais
  // envoyée), pour ne pas cacher les autres erreurs derrière celle-là.
  const parsed = ProjectInput.safeParse({
    title: form.title,
    pitch: form.pitch,
    description: form.description,
    status: form.status,
    visibility: form.audience === 'private' ? 'private' : 'public', // « members » = public
    demoUrl: demoUrlOf(form),
    tools: form.tools,
    prompts: form.prompts,
    primaryCategory: form.primaryCategory ?? 'art',
    // Une seconde sans principale ne dit rien : la principale manque, c'est la seule erreur.
    secondaryCategory: form.primaryCategory ? form.secondaryCategory : null,
    difficulty: form.difficulty,
    startedOn: form.startedOn,
  })

  const errors: ProjectFormErrors = {}
  if (!parsed.success) {
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
  }
  if (form.primaryCategory === null && !waived) errors.primaryCategory = 'chooseCategory'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  if (!parsed.success) return { ok: false, errors }

  if (initial) return { ok: true, changes: changedFields(initial, form) }
  return { ok: true, changes: parsed.data }
}

/**
 * Ce que la feuille dit au-dessus des champs (un seul message à la fois), sorti de l'écran après
 * les relectures (ui-C6). Par ordre de priorité :
 * - `message` : le message général de l'envoi (champs à corriger, erreur de l'API) ;
 * - `photosCut` : des photos en trop, laissées de côté ;
 * - `describeFailed` : la description d'une photo n'a pas pu s'enregistrer ;
 * - `photoProblem` : une photo n'a pas pu partir (ou être retirée) ;
 * - `portraitProblem` : de même pour la couverture verticale ;
 * - `uploadFailed` : arrivé en modification juste après une publication dont des photos manquent ;
 * - `preparing` : à la création, une photo se prépare encore (« Publier » attend) ;
 * - `unchanged` : en modification, rien à enregistrer.
 */
export type FormNoticeKind =
  | 'message'
  | 'photosCut'
  | 'describeFailed'
  | 'photoProblem'
  | 'portraitProblem'
  | 'uploadFailed'
  | 'preparing'
  | 'unchanged'

/** Ce dont dépend le choix : chaque problème en cours, et l'état du formulaire. */
export type FormNoticeState = {
  message: boolean
  photosCut: boolean
  /** Le problème des photos : la description, ou un autre (envoi, retrait). */
  photoProblem: 'describeFailed' | 'other' | null
  portraitProblem: boolean
  uploadFailed: boolean
  editing: boolean
  preparing: boolean
  dirty: boolean
}

/** Le message à montrer, ou `null` : la feuille ne dit rien. */
export const formNoticeKind = (state: FormNoticeState): FormNoticeKind | null => {
  if (state.message) return 'message'
  if (state.photosCut) return 'photosCut'
  if (state.photoProblem === 'describeFailed') return 'describeFailed'
  if (state.photoProblem) return 'photoProblem'
  if (state.portraitProblem) return 'portraitProblem'
  if (state.uploadFailed && state.editing) return 'uploadFailed'
  if (!state.editing && state.preparing) return 'preparing'
  if (state.editing && !state.dirty) return 'unchanged'
  return null
}

/**
 * Le ton de chaque message : une erreur (en alerte), ou une information ; `polite` : annoncée
 * sans interrompre (elle suit un état, pas un geste raté).
 */
export const FORM_NOTICE_TONES: Record<FormNoticeKind, { tone: 'error' | 'info'; polite?: true }> =
  {
    message: { tone: 'error' },
    photosCut: { tone: 'error' },
    describeFailed: { tone: 'error' },
    photoProblem: { tone: 'error' },
    portraitProblem: { tone: 'error' },
    uploadFailed: { tone: 'info' },
    preparing: { tone: 'info', polite: true },
    unchanged: { tone: 'info', polite: true },
  }
