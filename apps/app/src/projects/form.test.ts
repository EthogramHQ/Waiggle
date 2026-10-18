// Tests des règles du formulaire de projet (fonctions pures : pas d'écran, pas de réseau).
import { recipesProject } from '../testing/projects'
import { emptyProjectForm, formFromProject, toProjectChanges } from './form'

const filled = { ...emptyProjectForm, title: 'Mon agent', pitch: 'Il cuisine pour moi.' }

describe('toProjectChanges', () => {
  it('prepares a project with only a title and a pitch', () => {
    expect(toProjectChanges(filled)).toEqual({
      ok: true,
      changes: {
        title: 'Mon agent',
        pitch: 'Il cuisine pour moi.',
        description: '',
        status: 'idea',
        visibility: 'public',
        demoUrl: null, // case vide : pas de démo
        tools: [],
        timeSpent: null,
        prompts: [],
      },
    })
  })

  it('splits the tools and drops the empty prompts', () => {
    const result = toProjectChanges({
      ...filled,
      tools: 'Claude, Cursor , ',
      prompts: ['Fais…', ' '],
    })

    expect(result).toMatchObject({
      ok: true,
      changes: { tools: ['Claude', 'Cursor'], prompts: ['Fais…'] },
    })
  })

  it('asks for a title and a pitch', () => {
    expect(toProjectChanges(emptyProjectForm)).toEqual({
      ok: false,
      errors: { title: 'titleRequired', pitch: 'pitchRequired' },
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
      tools: Array.from({ length: 16 }, (_, i) => `Outil ${i}`).join(','),
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
    expect(toProjectChanges({ ...filled, title: 'Mon‮agent' })).toEqual({
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
      visibility: 'public',
      demoUrl: 'https://recettes.example.com',
      tools: 'Claude Code, Cursor',
      timeSpent: 'weekend',
      prompts: ['Propose trois recettes avec : {ingrédients}'],
    })
  })
})
