// Tests de la recherche d'outils dans le catalogue (tranche R6b, scénario « Choisir ses outils »,
// planche `R6-Publier-Outils`). Quand un membre tape « clau » dans le champ des outils, l'appli lui
// propose les outils du catalogue dont le nom ou un autre nom (un « alias » : « Chat GPT » pour
// « ChatGPT ») contient ces lettres : ceux qui commencent par elles d'abord, puis ceux qui les
// contiennent, et dans chaque groupe les plus utilisés d'abord ; huit au plus. Les accents, les
// majuscules, les espaces et la ponctuation ne comptent pas (le repli `foldTool` du contrat).
//
// L'API du module (découpage amendé de R6b, U1) :
// - `matchTools(tools, query, chosen)` rend `{ suggestions, known }` : `suggestions`, les outils à
//   proposer (`{ name, uses, family }`), sans ceux déjà choisis ; `known`, vrai quand le texte tapé,
//   replié, est exactement le nom ou un alias d'un outil du catalogue (le champ ne propose alors pas
//   de l'ajouter « comme autre outil ») ;
// - `isCatalogueName(tools, name)` : ce nom désigne-t-il un outil du catalogue, par son nom ou un
//   alias ? (une pastille qui ne l'est pas est un « Autre »).
//
// C'est un module pur (aucun écran, aucune requête) : on l'essaie avec un petit catalogue écrit ici.
import type { CatalogueTool } from '@ruche/contracts'
import { isCatalogueName, matchTools } from './match'

/** Un outil du catalogue, tel que GET /v1/tools le rend ; seuls le nom et le nombre varient ici. */
const tool = (
  name: string,
  projectCount: number,
  aliases: string[] = [],
  family: CatalogueTool['family'] = 'assistant',
): CatalogueTool => ({
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  family,
  aliases,
  projectCount,
})

const claude = tool('Claude', 41)
const claudeCode = tool('Claude Code', 12, [], 'development')
const openClaude = tool('Open Claude', 90)
const python = tool('Python', 100, [], 'development')
const chatgpt = tool('ChatGPT', 50, ['Chat GPT', 'GPT-4'])
const writer = tool('Écrivain', 3)
const catalogue = [claudeCode, python, claude, openClaude, chatgpt, writer]

/** Les noms proposés, dans l'ordre. */
const names = (query: string, chosen: string[] = [], tools = catalogue) =>
  matchTools(tools, query, chosen).suggestions.map((suggestion) => suggestion.name)

describe('matchTools', () => {
  it('proposes the tools that start with the typed letters first, then those that contain them', () => {
    // « Open Claude » a plus de projets, mais ne commence pas par « clau » : il vient après.
    expect(names('clau')).toEqual(['Claude', 'Claude Code', 'Open Claude'])
  })

  it('orders each group by number of projects, the most used first', () => {
    const tools = [tool('Notion', 2), tool('Notebook', 30), tool('Nothing AI', 7)]

    expect(names('no', [], tools)).toEqual(['Notebook', 'Nothing AI', 'Notion'])
  })

  it('ignores capitals and accents', () => {
    expect(names('CLAU')).toEqual(['Claude', 'Claude Code', 'Open Claude'])
    expect(names('ecri')).toEqual(['Écrivain'])
    expect(names('ÉCRI')).toEqual(['Écrivain'])
  })

  it('ignores spaces and punctuation, as foldTool does', () => {
    expect(names('chat gpt')).toEqual(['ChatGPT'])
    expect(names('claude-code')).toEqual(['Claude Code'])
  })

  it('finds a tool by one of its aliases, and proposes it under its catalogue name', () => {
    // « gpt 4 » ne se trouve que dans l'alias « GPT-4 » : c'est ChatGPT qui est proposé.
    expect(names('gpt 4')).toEqual(['ChatGPT'])
  })

  it('gives each suggestion its number of projects', () => {
    const [first] = matchTools(catalogue, 'claude c', []).suggestions

    expect(first).toEqual(expect.objectContaining({ name: 'Claude Code', uses: 12 }))
  })

  it('proposes 8 tools at most, the most used ones', () => {
    const tools = Array.from({ length: 12 }, (_, i) => tool(`Robot ${i + 1}`, i + 1))

    expect(names('robot', [], tools)).toEqual([
      'Robot 12',
      'Robot 11',
      'Robot 10',
      'Robot 9',
      'Robot 8',
      'Robot 7',
      'Robot 6',
      'Robot 5',
    ])
  })

  it('proposes the most used tools for an empty query', () => {
    // Champ vide : la liste montre ce qu'on peut prendre avant de taper (comme en R6a).
    expect(names('')).toEqual([
      'Python',
      'Open Claude',
      'ChatGPT',
      'Claude',
      'Claude Code',
      'Écrivain',
    ])
  })

  it('leaves out the tools already chosen, however they were written', () => {
    expect(names('clau', ['claude'])).toEqual(['Claude Code', 'Open Claude'])
    // « Chat GPT » choisi : ChatGPT l'est déjà, au repli près.
    expect(names('chat', ['Chat GPT'])).toEqual([])
  })

  it('proposes nothing that does not contain the typed letters', () => {
    expect(names('teachable')).toEqual([])
  })
})

describe('matchTools, known', () => {
  it('knows a name typed exactly, whatever its capitals and spaces', () => {
    expect(matchTools(catalogue, 'claude', []).known).toBe(true)
    expect(matchTools(catalogue, 'CHATGPT', []).known).toBe(true)
  })

  it('knows an alias spelled unlike the name of its tool', () => {
    expect(matchTools(catalogue, 'chat gpt', []).known).toBe(true)
    expect(matchTools(catalogue, 'gpt 4', []).known).toBe(true)
  })

  it('does not know a name that only starts like a catalogue tool', () => {
    expect(matchTools(catalogue, 'clau', []).known).toBe(false)
  })

  it('does not know a name absent from the catalogue', () => {
    expect(matchTools(catalogue, 'Teachable Machine', []).known).toBe(false)
  })

  it('still knows a catalogue name already chosen, so that it is never added as an other tool', () => {
    expect(matchTools(catalogue, 'Claude', ['Claude']).known).toBe(true)
  })
})

describe('isCatalogueName', () => {
  it('recognises a catalogue name or an alias, folded', () => {
    expect(isCatalogueName(catalogue, 'claude code')).toBe(true)
    expect(isCatalogueName(catalogue, 'Chat-GPT')).toBe(true)
    expect(isCatalogueName(catalogue, 'gpt4')).toBe(true)
    expect(isCatalogueName(catalogue, 'ecrivain')).toBe(true)
  })

  it('does not recognise an other tool, nor a part of a name', () => {
    expect(isCatalogueName(catalogue, 'Teachable Machine')).toBe(false)
    expect(isCatalogueName(catalogue, 'Claud')).toBe(false)
  })

  it('recognises nothing while the catalogue is empty', () => {
    expect(isCatalogueName([], 'Claude')).toBe(false)
  })
})
