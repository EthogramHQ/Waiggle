// Tests du contrat de la recherche par mots (tranche R3) : ce que l'appli peut demander
// (GET /v1/search?q=), le repli des accents partagé par l'API et l'appli (« eleve » trouve
// « Élève »), les mots retenus d'une recherche, et la forme des réponses. Scénario :
// docs/scenarios/refonte.md, « R3 », « La recherche par mots » ; règles sec-B2 (les mots) et
// sec-A1/A2 (le repli) de la relecture de sécurité du plan.
import { describe, expect, it } from 'vitest'
import {
  foldForSearch,
  foldWithMap,
  SEARCH_EXCERPT_MAX,
  SEARCH_FOLD,
  SEARCH_GROUP_MAX,
  SEARCH_QUERY_MAX,
  SEARCH_WORDS_MAX,
  SearchMember,
  SearchProject,
  SearchQuery,
  SearchResults,
  searchWords,
  TOOL_LIST_MAX,
  ToolList,
} from './search'

// Un numéro Unicode « à ignorer par défaut », écrit par son numéro : tapé tel quel, il serait
// invisible dans ce fichier (U+200B, l'espace de largeur nulle, est refusé comme partout).
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)

describe('foldForSearch', () => {
  it('lowers the case and drops the accents: « eleve » finds « Élève » and « ÉLÈVE »', () => {
    expect(foldForSearch('Élève')).toBe('eleve')
    expect(foldForSearch('ÉLÈVE')).toBe('eleve')
    expect(foldForSearch('eleve')).toBe('eleve')
  })

  it("turns the typographic apostrophe into the straight one: « L’Élève » gives « l'eleve »", () => {
    expect(foldForSearch('L’Élève')).toBe("l'eleve")
  })

  it('writes « œ », « æ » and « ß » with two letters: « ŒUVRE » gives « oeuvre »', () => {
    expect(foldForSearch('ŒUVRE')).toBe('oeuvre')
    expect(foldForSearch('cœur')).toBe('coeur')
    expect(foldForSearch('Ærø')).toBe('aero')
    expect(foldForSearch('Straße')).toBe('strasse')
  })

  it('folds every accented letter of the table, lower and upper case alike', () => {
    expect(foldForSearch('àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ')).toBe('aaaaaaceeeeiiiinoooooouuuuyy')
    expect(foldForSearch('ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŸ')).toBe('aaaaaaceeeeiiiinoooooouuuuyy')
  })

  it('leaves alone what it does not know: digits, punctuation, emoji, other alphabets', () => {
    expect(foldForSearch('100% local_2 🐝')).toBe('100% local_2 🐝')
    expect(foldForSearch('مريم')).toBe('مريم')
  })

  it('has a table whose every entry gives plain lower-case letters or an apostrophe', () => {
    // Le SQL de l'API est construit depuis cette table : une entrée qui donnerait autre chose
    // qu'une lettre simple (ou l'apostrophe droite) replierait de travers des deux côtés.
    for (const [from, to] of Object.entries(SEARCH_FOLD)) {
      expect(to, from).toMatch(/^(?:[a-z]{1,2}|')$/)
      expect([...from]).toHaveLength(1)
    }
  })
})

describe('foldWithMap', () => {
  it('gives the same folded text as foldForSearch', () => {
    for (const text of ['L’Élève', 'ŒUVRE', 'Carnet de cafés', '🐝 Été', '']) {
      expect(foldWithMap(text).folded, text).toBe(foldForSearch(text))
    }
  })

  it('maps each folded character to its position in the original text', () => {
    const { folded, map } = foldWithMap('L’Élève')

    expect(folded).toBe("l'eleve")
    // Un caractère replié pour un caractère d'origine : les positions se suivent, et la dernière
    // entrée est la longueur du texte (pour lire la fin d'une correspondance par map[end]).
    expect(map).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(map).toHaveLength(folded.length + 1)
  })

  it('points the two letters of a folded « œ » to the same original character', () => {
    const { folded, map } = foldWithMap('Œuvre')

    expect(folded).toBe('oeuvre')
    expect(map).toEqual([0, 0, 1, 2, 3, 4, 5])
    // « oeu » trouvé en [0, 3) dans le texte replié : « Œu » dans l'original.
    expect('Œuvre'.slice(map[0] ?? -1, map[3] ?? -1)).toBe('Œu')
  })

  it('keeps the positions right after an emoji, which takes two UTF-16 units', () => {
    const text = '🐝 Été'
    const { folded, map } = foldWithMap(text)

    expect(folded).toBe('🐝 ete')
    // `map` est indexé comme `folded` (unités UTF-16, celles de `slice`) : l'emoji occupe deux
    // places dans le texte replié aussi, et « ete », trouvé en [3, 6), est bien « Été ».
    expect(map).toHaveLength(folded.length + 1)
    const start = folded.indexOf('ete')
    expect(start).toBe(3)
    expect(text.slice(map[start] ?? -1, map[start + 3] ?? -1)).toBe('Été')
  })

  it('gives an empty text and a single end position for an empty text', () => {
    expect(foldWithMap('')).toEqual({ folded: '', map: [0] })
  })
})

describe('searchWords', () => {
  it('folds the words and keeps their order', () => {
    expect(searchWords('Carnet de Cafés')).toEqual(['carnet', 'de', 'cafes'])
    expect(searchWords('L’Élève')).toEqual(["l'eleve"])
  })

  it('ignores one-letter words, so "e a" finds no member', () => {
    expect(searchWords('e a')).toEqual([])
    expect(searchWords('a carnet')).toEqual(['carnet'])
  })

  it('never matches everything when the query has two spaces in a row', () => {
    // Sans cette garde, `split` donnerait un mot vide, et strpos(x, '') vaut 1 : tout serait trouvé.
    expect(searchWords('carnet  cafe')).toEqual(['carnet', 'cafe'])
    expect(searchWords('  carnet ')).toEqual(['carnet'])
    expect(searchWords('carnet\t\ncafe')).toEqual(['carnet', 'cafe'])
    expect(searchWords('carnet  cafe')).not.toContain('')
  })

  it('counts a repeated word once', () => {
    expect(searchWords('élève ELEVE Élève')).toEqual(['eleve'])
  })

  it('keeps 5 words at most, the first ones', () => {
    expect(searchWords('un deux trois quatre cinq six sept')).toEqual([
      'un',
      'deux',
      'trois',
      'quatre',
      'cinq',
    ])
    expect(SEARCH_WORDS_MAX).toBe(5)
  })

  it('counts the words kept, not the words typed, towards the 5', () => {
    // « a » et le doublon ne prennent pas de place : « six » entre encore.
    expect(searchWords('a un deux un trois quatre cinq six')).toEqual([
      'un',
      'deux',
      'trois',
      'quatre',
      'cinq',
    ])
    expect(searchWords('a un un deux trois quatre six')).toEqual([
      'un',
      'deux',
      'trois',
      'quatre',
      'six',
    ])
  })
})

describe('SearchQuery', () => {
  it('trims the text and keeps it as typed otherwise', () => {
    expect(SearchQuery.parse({ q: '  Carnet ' })).toEqual({ q: 'Carnet' })
    expect(SearchQuery.parse({ q: 'L’Élève' })).toEqual({ q: 'L’Élève' })
  })

  it('waits for 2 characters', () => {
    expect(SearchQuery.safeParse({ q: 'a' }).success).toBe(false)
    expect(SearchQuery.safeParse({ q: ' a ' }).success).toBe(false)
    expect(SearchQuery.safeParse({ q: '' }).success).toBe(false)
    expect(SearchQuery.safeParse({}).success).toBe(false)
    expect(SearchQuery.safeParse({ q: 'ab' }).success).toBe(true)
  })

  it('stops at 80 characters', () => {
    expect(SearchQuery.safeParse({ q: 'a'.repeat(SEARCH_QUERY_MAX) }).success).toBe(true)
    expect(SearchQuery.safeParse({ q: 'a'.repeat(SEARCH_QUERY_MAX + 1) }).success).toBe(false)
  })

  it('refuses invisible and control characters, like every text received', () => {
    expect(SearchQuery.safeParse({ q: `car${ZERO_WIDTH_SPACE}net` }).success).toBe(false)
    expect(SearchQuery.safeParse({ q: 'car\u0000net' }).success).toBe(false)
    expect(SearchQuery.safeParse({ q: 'car‮net' }).success).toBe(false)
  })

  it('refuses a text that leaves no word to search', () => {
    // Deux caractères ou plus, mais aucun mot de deux lettres : rien à chercher.
    expect(SearchQuery.safeParse({ q: 'e a' }).success).toBe(false)
    expect(SearchQuery.safeParse({ q: 'a b c' }).success).toBe(false)
    // Témoin : un seul mot de deux lettres suffit.
    expect(SearchQuery.safeParse({ q: 'a bc' }).success).toBe(true)
  })

  it('accepts « % » and « _ », which are searched as they are', () => {
    expect(SearchQuery.safeParse({ q: '50%' }).success).toBe(true)
    expect(SearchQuery.safeParse({ q: 'a_c' }).success).toBe(true)
  })
})

describe('SearchResults', () => {
  const project = {
    id: '6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f',
    author: { id: 'u1', name: 'Léa', avatarUrl: null },
    title: 'Carnet de cafés',
    pitch: 'Chaque café goûté, noté.',
    status: 'testable',
    visibility: 'public',
    tools: [{ label: 'Claude Code', slug: 'claude-code' }],
    cover: null,
    portraitCover: null,
    createdAt: '2026-10-12T09:00:00.000Z',
    updatedAt: '2026-10-12T09:00:00.000Z',
    excerpt: null,
  }
  const member = {
    id: 'camille-id',
    name: 'Camille Carnot',
    handle: 'camille_carnot',
    avatarUrl: null,
    followerCount: 12,
  }
  const tool = { slug: 'notion', label: 'Notion', projectCount: 7 }
  const empty = { items: [], more: false }

  it('always carries the three groups, even empty', () => {
    expect(SearchResults.parse({ projects: empty, members: empty, tools: empty })).toEqual({
      projects: empty,
      members: empty,
      tools: empty,
    })
    expect(SearchResults.safeParse({ projects: empty, members: empty }).success).toBe(false)
  })

  it('gives 20 results at most per group, and says whether there were more', () => {
    const items = Array.from({ length: SEARCH_GROUP_MAX }, (_, i) => ({ ...tool, slug: `t${i}` }))
    expect(
      SearchResults.safeParse({ projects: empty, members: empty, tools: { items, more: true } })
        .success,
    ).toBe(true)
    expect(
      SearchResults.safeParse({
        projects: empty,
        members: empty,
        tools: { items: [...items, tool], more: true },
      }).success,
    ).toBe(false)
    expect(
      SearchResults.safeParse({ projects: empty, members: empty, tools: { items } }).success,
    ).toBe(false)
  })

  it('gives a found project with its excerpt, 160 characters at most, or null', () => {
    expect(SearchProject.parse(project).excerpt).toBeNull()
    const excerpt = `… ${'un carnet '.repeat(14)}…`.slice(0, SEARCH_EXCERPT_MAX)
    expect(SearchProject.parse({ ...project, excerpt }).excerpt).toBe(excerpt)
    expect(
      SearchProject.safeParse({ ...project, excerpt: 'x'.repeat(SEARCH_EXCERPT_MAX + 1) }).success,
    ).toBe(false)
    expect(SearchProject.safeParse({ ...project, excerpt: undefined }).success).toBe(false)
  })

  it('gives a found member with a follower count, never an email address', () => {
    expect(SearchMember.parse(member)).toEqual(member)
    const parsed = SearchMember.parse({ ...member, email: 'camille@example.com' })
    expect(JSON.stringify(parsed)).not.toContain('camille@example.com')
    expect(SearchMember.safeParse({ ...member, followerCount: -1 }).success).toBe(false)
  })

  it('gives a found tool with its number of public projects', () => {
    expect(
      SearchResults.parse({
        projects: empty,
        members: empty,
        tools: { items: [tool], more: false },
      }).tools.items,
    ).toEqual([tool])
  })
})

describe('ToolList', () => {
  it('lists 500 tools at most', () => {
    const tools = Array.from({ length: TOOL_LIST_MAX }, (_, i) => ({
      slug: `tool-${i}`,
      label: `Tool ${i}`,
      projectCount: 1,
    }))
    expect(ToolList.safeParse({ tools }).success).toBe(true)
    expect(
      ToolList.safeParse({ tools: [...tools, { slug: 'extra', label: 'Extra', projectCount: 1 }] })
        .success,
    ).toBe(false)
  })
})
