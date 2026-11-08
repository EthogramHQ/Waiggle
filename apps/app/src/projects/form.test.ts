// Tests des règles du formulaire de projet (fonctions pures : pas d'écran, pas de réseau).
//
// R6a (plan, « La logique », U5a) : le formulaire n'a plus de temps passé ; il gagne la catégorie
// principale (obligatoire pour publier), la seconde, « Facile à refaire ? », « Commencé en », et
// « Qui peut le voir ? » (`audience` : « members » ou « private », l'API garde « public » /
// « private »). Les outils sont une liste (le champ à suggestions `ToolField`), plus un texte à
// virgules. `isDirty` dit si « Enregistrer » a quelque chose à envoyer ; `changedFields` donne le
// PATCH des seuls champs changés, les deux catégories toujours ensemble (relecture sec-M2).
import { recipesProject } from '../testing/projects'
import {
  changedFields,
  emptyProjectForm,
  formFromProject,
  isDirty,
  type ProjectForm,
  toProjectChanges,
} from './form'

const filled: ProjectForm = {
  ...emptyProjectForm,
  title: 'Mon agent',
  pitch: 'Il cuisine pour moi.',
  primaryCategory: 'cooking',
}

describe('emptyProjectForm', () => {
  it('starts as an idea seen by members, without category, month or difficulty', () => {
    expect(emptyProjectForm).toEqual({
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
    })
  })
})

describe('toProjectChanges', () => {
  it('prepares a project with a title, a pitch and a category', () => {
    expect(toProjectChanges(filled)).toEqual({
      ok: true,
      changes: {
        title: 'Mon agent',
        pitch: 'Il cuisine pour moi.',
        description: '',
        status: 'idea',
        visibility: 'public', // « Membres de Waiggle »
        demoUrl: null, // case vide : pas de démo
        tools: [],
        prompts: [],
        primaryCategory: 'cooking',
        secondaryCategory: null,
        difficulty: null,
        startedOn: null,
      },
    })
  })

  it('sends a private project as « private »', () => {
    expect(toProjectChanges({ ...filled, audience: 'private' })).toMatchObject({
      ok: true,
      changes: { visibility: 'private' },
    })
  })

  it('keeps the second category, the difficulty and the started month', () => {
    expect(
      toProjectChanges({
        ...filled,
        primaryCategory: 'science',
        secondaryCategory: 'learning',
        difficulty: 'medium',
        startedOn: '2026-03',
      }),
    ).toMatchObject({
      ok: true,
      changes: {
        primaryCategory: 'science',
        secondaryCategory: 'learning',
        difficulty: 'medium',
        startedOn: '2026-03',
      },
    })
  })

  it('never sends a time spent', () => {
    const result = toProjectChanges(filled)
    expect(result.ok && 'timeSpent' in result.changes).toBe(false)
  })

  it('keeps the tools and drops the empty prompts', () => {
    const result = toProjectChanges({
      ...filled,
      tools: ['Claude', 'Cursor'],
      prompts: ['Fais…', ' '],
    })

    expect(result).toMatchObject({
      ok: true,
      changes: { tools: ['Claude', 'Cursor'], prompts: ['Fais…'] },
    })
  })

  it('asks for a title, a pitch and a category', () => {
    expect(toProjectChanges(emptyProjectForm)).toEqual({
      ok: false,
      errors: { title: 'titleRequired', pitch: 'pitchRequired', primaryCategory: 'chooseCategory' },
    })
  })

  it('asks for the category alone when the rest is filled in', () => {
    expect(toProjectChanges({ ...filled, primaryCategory: null })).toEqual({
      ok: false,
      errors: { primaryCategory: 'chooseCategory' },
    })
  })

  it('refuses a demo link that is not a public https address', () => {
    for (const demoUrl of [
      'http://site.example.org',
      'https://192.168.1.2',
      'recettes.example.net',
    ]) {
      expect(toProjectChanges({ ...filled, demoUrl })).toEqual({
        ok: false,
        errors: { demoUrl: 'demoUrlInvalid' },
      })
    }
  })

  it('names each limit that is exceeded', () => {
    const result = toProjectChanges({
      ...filled,
      title: 'a'.repeat(81),
      pitch: 'a'.repeat(141),
      description: 'a'.repeat(10_001),
      tools: Array.from({ length: 16 }, (_, i) => `Outil ${i}`),
      prompts: ['a', 'b', 'c', 'd', 'e', 'f'],
    })

    expect(result).toEqual({
      ok: false,
      errors: {
        title: 'titleTooLong',
        pitch: 'pitchTooLong',
        description: 'descriptionTooLong',
        tools: 'tooManyTools',
        prompts: 'tooManyPrompts',
      },
    })
  })

  it('refuses invisible characters', () => {
    expect(
      toProjectChanges({ ...filled, title: `Mon${String.fromCodePoint(0x202e)}agent` }),
    ).toEqual({
      ok: false,
      errors: { title: 'invalidCharacters' },
    })
  })
})

describe('formFromProject', () => {
  it('fills the form with an existing project, ready to be edited', () => {
    expect(formFromProject(recipesProject)).toEqual({
      title: 'Mon agent de recettes',
      pitch: 'Un menu avec ce qu’il y a au frigo.',
      description: '## Comment ça marche\n\nOn **photographie** le frigo.',
      status: 'testable',
      audience: 'members',
      demoUrl: 'https://recettes.example.com',
      tools: ['Claude Code', 'Cursor'],
      prompts: ['Propose trois recettes avec : {ingrédients}'],
      primaryCategory: 'cooking',
      secondaryCategory: 'family',
      difficulty: 'easy',
      startedOn: '2026-09',
    })
  })

  it('leaves the category empty for a project published before R6a', () => {
    const old = { ...recipesProject, primaryCategory: null, secondaryCategory: null }
    expect(formFromProject(old)).toMatchObject({ primaryCategory: null, secondaryCategory: null })
  })

  it('reads a private project as « private »', () => {
    expect(formFromProject({ ...recipesProject, visibility: 'private' }).audience).toBe('private')
  })
})

describe('isDirty', () => {
  const initial = formFromProject(recipesProject)

  it('says nothing changed for the form as it was opened', () => {
    expect(isDirty(initial, { ...initial })).toBe(false)
  })

  it('sees a change in any field', () => {
    const changes: Partial<ProjectForm>[] = [
      { title: 'Nouveau titre' },
      { pitch: 'Autre phrase.' },
      { description: 'Autre texte' },
      { status: 'done' },
      { audience: 'private' },
      { demoUrl: '' },
      { tools: ['Claude Code'] },
      { prompts: [] },
      { primaryCategory: 'science' },
      { secondaryCategory: null },
      { difficulty: 'hard' },
      { startedOn: null },
    ]
    for (const change of changes) expect(isDirty(initial, { ...initial, ...change })).toBe(true)
  })

  it('says nothing changed once a change is undone', () => {
    const changed = { ...initial, title: 'Nouveau titre', tools: ['Claude Code'] }
    expect(isDirty(initial, { ...changed, title: initial.title, tools: [...initial.tools] })).toBe(
      false,
    )
  })

  it('sees a new project with only a category chosen as changed', () => {
    expect(isDirty(emptyProjectForm, { ...emptyProjectForm, primaryCategory: 'science' })).toBe(
      true,
    )
  })
})

describe('changedFields', () => {
  const initial = formFromProject(recipesProject)

  it('sends nothing when nothing changed', () => {
    expect(changedFields(initial, { ...initial })).toEqual({})
  })

  it('sends only the changed fields', () => {
    expect(changedFields(initial, { ...initial, title: 'Nouveau titre', status: 'done' })).toEqual({
      title: 'Nouveau titre',
      status: 'done',
    })
  })

  it('sends the audience as the visibility of the API', () => {
    expect(changedFields(initial, { ...initial, audience: 'private' })).toEqual({
      visibility: 'private',
    })
  })

  it('sends an emptied demo link as null', () => {
    expect(changedFields(initial, { ...initial, demoUrl: '' })).toEqual({ demoUrl: null })
  })

  it('always sends both categories together, even when only one changed', () => {
    expect(changedFields(initial, { ...initial, primaryCategory: 'science' })).toEqual({
      primaryCategory: 'science',
      secondaryCategory: 'family',
    })
    expect(changedFields(initial, { ...initial, secondaryCategory: null })).toEqual({
      primaryCategory: 'cooking',
      secondaryCategory: null,
    })
  })

  it('sends an emptied month and difficulty as null', () => {
    expect(changedFields(initial, { ...initial, startedOn: null, difficulty: null })).toEqual({
      startedOn: null,
      difficulty: null,
    })
  })
})
