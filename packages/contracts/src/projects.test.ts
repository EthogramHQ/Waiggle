// Tests des règles d'un projet : ce qu'un membre peut publier, et quels liens de démo sont acceptés.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from './errors'
import {
  cleanPrompt,
  DemoUrl,
  PROJECT_CATEGORIES,
  Project,
  ProjectChanges,
  ProjectInput,
  ProjectSummary,
  StartedMonth,
  startedMonthMax,
  VisualSlot,
  VisualUpdate,
} from './projects'
import { NO_REACTIONS } from './reactions'
import { publicHttpsUrl } from './url'
import { PHOTO_DESCRIPTION_MAX, ProjectVisual, Thumbhash } from './visuals'

const valid = {
  title: 'Mon agent de recettes',
  pitch: 'Il propose un menu avec ce qu’il y a au frigo.',
  primaryCategory: 'cooking',
}

describe('ProjectInput', () => {
  it('only needs a title, a pitch and a category', () => {
    expect(ProjectInput.parse(valid)).toEqual(valid)
  })

  it('refuses a title longer than 80 characters or a pitch longer than 140', () => {
    expect(ProjectInput.safeParse({ ...valid, title: 'a'.repeat(81) }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, pitch: 'a'.repeat(141) }).success).toBe(false)
  })

  it('keeps the pitch on a single line', () => {
    expect(ProjectInput.safeParse({ ...valid, pitch: 'Ligne 1\nLigne 2' }).success).toBe(false)
  })

  it('accepts a Markdown description of up to 10 000 characters', () => {
    expect(
      ProjectInput.safeParse({ ...valid, description: '# Titre\n\n- un\n- deux' }).success,
    ).toBe(true)
    expect(ProjectInput.safeParse({ ...valid, description: 'a'.repeat(10_001) }).success).toBe(
      false,
    )
  })

  it('only accepts the known statuses, visibilities and difficulties', () => {
    expect(ProjectInput.safeParse({ ...valid, status: 'testable' }).success).toBe(true)
    expect(ProjectInput.safeParse({ ...valid, status: 'abandonné' }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, visibility: 'friends' }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, difficulty: 'medium' }).success).toBe(true)
    expect(ProjectInput.safeParse({ ...valid, difficulty: 'facile' }).success).toBe(false)
  })

  it('removes duplicate tools and empty prompts, within their limits', () => {
    expect(
      ProjectInput.parse({
        ...valid,
        tools: ['Claude', 'claude', 'Cursor'],
        prompts: ['Fais…', '  '],
      }),
    ).toMatchObject({ tools: ['Claude', 'Cursor'], prompts: ['Fais…'] })
    const tools = Array.from({ length: 16 }, (_, i) => `Outil ${i}`)
    expect(ProjectInput.safeParse({ ...valid, tools }).success).toBe(false)
    expect(
      ProjectInput.safeParse({ ...valid, prompts: ['a', 'b', 'c', 'd', 'e', 'f'] }).success,
    ).toBe(false)
  })

  it('refuses any field it does not know, such as the author', () => {
    expect(ProjectInput.safeParse({ ...valid, authorId: 'someone-else' }).success).toBe(false)
  })
})

describe('ProjectChanges', () => {
  it('accepts a change of a single field, and removing the demo link', () => {
    expect(ProjectChanges.parse({ status: 'done' })).toEqual({ status: 'done' })
    expect(ProjectChanges.parse({ demoUrl: null })).toEqual({ demoUrl: null })
  })

  it('accepts a new order of the photos: at most six, each one once', () => {
    const ids = Array.from({ length: 7 }, () => crypto.randomUUID())
    expect(ProjectChanges.parse({ visualOrder: ids.slice(0, 6) })).toEqual({
      visualOrder: ids.slice(0, 6),
    })
    expect(ProjectChanges.safeParse({ visualOrder: ids }).success).toBe(false)
    expect(ProjectChanges.safeParse({ visualOrder: [ids[0], ids[0]] }).success).toBe(false)
    expect(ProjectChanges.safeParse({ visualOrder: ['../secrets'] }).success).toBe(false)
  })
})

// Les caractères invisibles d'un prompt collé (décision F-Mod4, tranche R5a). Ils s'écrivent par
// leur numéro (String.fromCodePoint) : écrits tels quels, on ne les verrait pas dans ce fichier, et
// un éditeur pourrait les perdre sans prévenir.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const TAG_LATIN_A = String.fromCodePoint(0xe0041) // un caractère « tag », invisible
const LINE_SEPARATOR = String.fromCodePoint(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029)
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d) // liant : 👩 + liant + 💻 = la femme au clavier
const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f) // ❤ + sélecteur = ❤️ en couleur

describe('Prompts pasted with invisible characters', () => {
  const promptsOf = (prompt: string) => ProjectInput.parse({ ...valid, prompts: [prompt] }).prompts

  it('saves a prompt without its zero-width spaces, direction overrides and tag characters', () => {
    expect(
      promptsOf(`Ré${ZERO_WIDTH_SPACE}sume ${RIGHT_TO_LEFT_OVERRIDE}ce texte${TAG_LATIN_A}.`),
    ).toEqual(['Résume ce texte.'])
  })

  it('also cleans the prompts of a change', () => {
    expect(ProjectChanges.parse({ prompts: [`Fais${ZERO_WIDTH_SPACE} un plan`] })).toEqual({
      prompts: ['Fais un plan'],
    })
  })

  it('turns Unicode line and paragraph separators into line breaks', () => {
    expect(promptsOf(`Un${LINE_SEPARATOR}deux${PARAGRAPH_SEPARATOR}trois`)).toEqual([
      'Un\ndeux\ntrois',
    ])
  })

  it('counts the length after removing the invisible characters', () => {
    // 4 000 caractères visibles et dix invisibles : accepté, et rendu sans eux (sec-B9).
    const long = 'a'.repeat(4_000)
    expect(promptsOf(`${long}${ZERO_WIDTH_SPACE.repeat(10)}`)).toEqual([long])
    // Le témoin : un caractère visible de plus, et le prompt est refusé.
    expect(ProjectInput.safeParse({ ...valid, prompts: [`${long}b`] }).success).toBe(false)
  })

  it('drops a prompt made only of invisible characters, like an empty one', () => {
    expect(promptsOf(`${ZERO_WIDTH_SPACE}${TAG_LATIN_A}`)).toEqual([])
  })

  it('keeps the joiners and variation selectors that build emoji', () => {
    const coder = `👩${ZERO_WIDTH_JOINER}💻`
    const heart = `❤${VARIATION_SELECTOR_16}`
    expect(promptsOf(`Signe avec ${coder} et ${heart}`)).toEqual([
      `Signe avec ${coder} et ${heart}`,
    ])
  })

  it('cleans with the same function the app uses to show and copy a prompt', () => {
    const pasted = `cu${ZERO_WIDTH_SPACE}rl${LINE_SEPARATOR}x`
    expect(cleanPrompt(pasted)).toBe('curl\nx')
    expect(promptsOf(pasted)).toEqual([cleanPrompt(pasted)])
  })
})

// Les visuels viennent de l'API : l'appli les vérifie avant de les afficher (ADR 0002).
const visual = {
  id: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
  kind: 'image',
  url: 'https://api.waiggle.com/media/visuals/2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f.webp',
  width: 1600,
  height: 900,
  // Le ThumbHash d'une vraie image : une vingtaine d'octets, écrits en base64.
  thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
  description: null,
}

describe('Thumbhash', () => {
  it('accepts the short base64 summary of an image', () => {
    expect(Thumbhash.parse(visual.thumbhash)).toBe(visual.thumbhash)
  })

  it('refuses anything that is not base64, or too long to be a ThumbHash', () => {
    expect(Thumbhash.safeParse('pas du base64 !').success).toBe(false)
    expect(Thumbhash.safeParse('<img src=x onerror=alert(1)>').success).toBe(false)
    expect(Thumbhash.safeParse('A'.repeat(68)).success).toBe(false)
    expect(Thumbhash.safeParse('').success).toBe(false)
  })
})

describe('ProjectVisual', () => {
  it('describes a photo: its address, its size and its blurred summary', () => {
    expect(ProjectVisual.parse(visual)).toEqual(visual)
  })

  it('only knows photos for now (video will have its own slice)', () => {
    expect(ProjectVisual.safeParse({ ...visual, kind: 'video' }).success).toBe(false)
  })
})

describe('VisualSlot', () => {
  it('is either the gallery or the vertical cover', () => {
    expect(VisualSlot.parse('gallery')).toBe('gallery')
    expect(VisualSlot.parse('portrait')).toBe('portrait')
    expect(VisualSlot.safeParse('landscape').success).toBe(false)
  })
})

describe('Project with its visuals', () => {
  const project = {
    id: '6a1d2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b',
    author: { id: 'u1', name: 'Léa', avatarUrl: null },
    title: 'Mon agent',
    pitch: 'Il aide.',
    description: '',
    status: 'idea',
    visibility: 'public',
    demoUrl: null,
    tools: [],
    prompts: [],
    primaryCategory: null,
    secondaryCategory: null,
    difficulty: null,
    startedOn: null,
    isMine: true,
    isFollowed: false,
    followerCount: 0,
    latestUpdate: null,
    updateCount: 0,
    version: null,
    isTester: false,
    testerCount: null,
    reactions: NO_REACTIONS,
    commentCount: 0,
    removal: null,
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
  }

  it('lists the gallery in order and the optional vertical cover', () => {
    const portrait = {
      ...visual,
      id: '7b2e3c4d-5e6f-4a71-8b8c-9d0e1f2a3b4c',
      width: 900,
      height: 1600,
    }
    expect(Project.parse({ ...project, visuals: [visual], portraitCover: portrait })).toMatchObject(
      {
        visuals: [visual],
        portraitCover: portrait,
      },
    )
    expect(Project.parse({ ...project, visuals: [], portraitCover: null }).visuals).toEqual([])
  })

  it('gives lists the cover and the vertical cover, not the whole gallery', () => {
    const summary = ProjectSummary.parse({
      ...project,
      cover: visual,
      portraitCover: null,
      reactionTotal: 0,
    })
    expect(summary).toMatchObject({ cover: visual, portraitCover: null })
    expect(summary).not.toHaveProperty('visuals')
  })

  // R4 : la carte du fil montre le total des réactions (« ✦ 49 »). Un nombre entier, jamais
  // négatif, et jamais des noms : le résumé ne garde ni la liste de qui a réagi, ni le détail par
  // type (celui-là reste sur la page du projet).
  it('carries the total of its reactions, a whole number, never who reacted', () => {
    const base = { ...project, cover: null, portraitCover: null }
    const summary = ProjectSummary.parse({
      ...base,
      reactionTotal: 49,
      reactors: ['max-id'],
    })
    expect(summary.reactionTotal).toBe(49)
    expect(summary).not.toHaveProperty('reactors')
    // Le détail par type (Project.reactions) n'entre pas dans le résumé.
    expect(summary).not.toHaveProperty('reactions')
    expect(ProjectSummary.parse({ ...base, reactionTotal: 0 }).reactionTotal).toBe(0)
  })

  it('refuses a summary without a total, or with a negative or fractional one', () => {
    const base = { ...project, cover: null, portraitCover: null }
    expect(ProjectSummary.safeParse(base).success).toBe(false)
    for (const reactionTotal of [-1, 1.5, '3', null]) {
      expect(
        ProjectSummary.safeParse({ ...base, reactionTotal }).success,
        String(reactionTotal),
      ).toBe(false)
    }
  })
})

describe('ErrorCode', () => {
  it('has a code for a seventh photo', () => {
    expect(ErrorCode.parse('too_many_visuals')).toBe('too_many_visuals')
  })
})

describe('DemoUrl', () => {
  const accepted = (url: string) => DemoUrl.safeParse(url).success

  it('accepts a public https address', () => {
    expect(accepted('https://mon-agent.example.com')).toBe(true)
    expect(accepted('https://demos.example.org/lea/recettes?lang=fr')).toBe(true)
  })

  it('refuses anything but https', () => {
    expect(accepted('http://mon-agent.example.com')).toBe(false)
    expect(accepted('javascript:alert(1)')).toBe(false)
    expect(accepted('ftp://example.com/demo')).toBe(false)
    expect(accepted('pas une adresse')).toBe(false)
  })

  it('refuses local and private machines', () => {
    for (const url of [
      'https://localhost:3000',
      'https://localhost.',
      'https://api.localhost',
      'https://imprimante.local',
      'https://nas.home.arpa',
      'https://wiki.internal',
      'https://intranet', // un nom sans point ne désigne qu'une machine du réseau local
    ]) {
      expect(accepted(url), url).toBe(false)
    }
  })

  it('refuses IP addresses, however they are written', () => {
    for (const url of [
      'https://192.168.1.1',
      'https://127.0.0.1',
      'https://0x7f.1', // 127.0.0.1 écrit en hexadécimal
      'https://2130706433', // 127.0.0.1 écrit comme un seul nombre
      'https://[::1]',
      'https://[::ffff:10.0.0.1]',
      'https://[fe80::1]',
      'https://8.8.8.8', // même publique : un nom de domaine est demandé
    ]) {
      expect(accepted(url), url).toBe(false)
    }
  })

  it('refuses an address that hides a login, often used to disguise the real site', () => {
    // « https://waiggle.com@pirate.example.com » mène en réalité à pirate.example.com.
    expect(accepted('https://waiggle.com@pirate.example.com')).toBe(false)
  })
})

describe('DemoUrl, normalized and hardened', () => {
  const accepted = (url: string) => DemoUrl.safeParse(url).success

  it('stores the address in its standard form', () => {
    expect(DemoUrl.parse('https://Mon-Agent.Example.com')).toBe('https://mon-agent.example.com/')
    // Un nom écrit avec un « а » cyrillique est enregistré sous sa forme réelle, en « xn-- ».
    expect(DemoUrl.parse('https://\u0430pple.com/login')).toBe('https://xn--pple-43d.com/login')
  })

  it('refuses local names hidden behind trailing dots or empty parts', () => {
    for (const url of [
      'https://localhost..',
      'https://intranet..',
      'https://nas.local..',
      'https://a..b.com',
      'https://foo.bar..',
    ]) {
      expect(accepted(url), url).toBe(false)
    }
  })

  it('refuses other reserved names', () => {
    for (const url of [
      'https://box.localdomain',
      'https://site.test',
      'https://x.onion',
      'https://wiki.corp',
    ]) {
      expect(accepted(url), url).toBe(false)
    }
  })

  it('refuses invisible or control characters, even inside the address', () => {
    expect(accepted('https://example.com/a\u202Eb')).toBe(false)
    expect(accepted('https://exa\tmple.com')).toBe(false)
  })
})

describe('publicHttpsUrl on a phone', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a name that the phone leaves in another alphabet, as it cannot be checked', () => {
    // Sur iOS et Android, l'outil URL d'Expo ne convertit pas les noms Unicode en « xn-- » :
    // on simule ce comportement avec une fausse classe URL.
    vi.stubGlobal(
      'URL',
      class {
        protocol = 'https:'
        username = ''
        password = ''
        hostname = '\u0430pple.com'
        href = 'https://\u0430pple.com/'
      },
    )

    expect(publicHttpsUrl('https://\u0430pple.com/')).toBeNull()
  })
})

// --- Tranche R6a : cat\u00e9gories, \u00ab Commenc\u00e9 en \u00bb, \u00ab Facile \u00e0 refaire ? \u00bb et descriptions des photos ---
// Sc\u00e9nario : docs/scenarios/refonte.md, section R6a. Le contrat est la premi\u00e8re barri\u00e8re : ce qu'il
// refuse n'atteint jamais la base, ni l'API, ni l'appli.

describe('the categories of a project (R6a)', () => {
  it('lists the sixteen categories in the order of the board, \u00ab other \u00bb last', () => {
    expect(PROJECT_CATEGORIES).toEqual([
      'home-garden',
      'cooking',
      'family',
      'learning',
      'games',
      'art',
      'music',
      'photo-video',
      'health-sport',
      'travel',
      'money',
      'work',
      'code',
      'animals',
      'science',
      'other',
    ])
  })

  // R6b : le contrat accepte tout code bien formé (une catégorie peut être créée) ; l'API refuse un
  // code qui n'est pas en base (api/projects.test.ts).
  it('needs a primary category at creation, and only a well-formed code', () => {
    const { primaryCategory: _, ...withoutCategory } = valid
    expect(ProjectInput.safeParse(withoutCategory).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, primaryCategory: null }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, primaryCategory: 'Jardinage !' }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, secondaryCategory: '' }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, primaryCategory: 'jardinage' }).success).toBe(true)
    // \u00ab Autre \u00bb ne demande aucun texte.
    expect(ProjectInput.safeParse({ ...valid, primaryCategory: 'other' }).success).toBe(true)
  })

  it('accepts a second category, or none', () => {
    expect(
      ProjectInput.parse({ ...valid, primaryCategory: 'science', secondaryCategory: 'learning' }),
    ).toMatchObject({ primaryCategory: 'science', secondaryCategory: 'learning' })
    expect(ProjectInput.safeParse({ ...valid, secondaryCategory: null }).success).toBe(true)
    expect(ProjectChanges.safeParse({ secondaryCategory: null }).success).toBe(true)
  })

  it('refuses a second category equal to the primary, at creation as in an update', () => {
    const creation = ProjectInput.safeParse({
      ...valid,
      primaryCategory: 'cooking',
      secondaryCategory: 'cooking',
    })
    const update = ProjectChanges.safeParse({
      primaryCategory: 'science',
      secondaryCategory: 'science',
    })

    expect(creation.success).toBe(false)
    expect(update.success).toBe(false)
    // L'erreur vise le champ de la seconde : c'est lui que l'appli montre.
    expect(creation.error?.issues[0]?.path).toEqual(['secondaryCategory'])
    expect(update.error?.issues[0]?.path).toEqual(['secondaryCategory'])
  })

  it('never lets an update set the primary category back to nothing', () => {
    expect(ProjectChanges.safeParse({ primaryCategory: null }).success).toBe(false)
    // Changer de principale, elle, reste permis.
    expect(ProjectChanges.parse({ primaryCategory: 'games' })).toEqual({ primaryCategory: 'games' })
  })
})

describe('the time spent is gone (R6a)', () => {
  it('refuses timeSpent, at creation as in an update, as an unknown field', () => {
    // strictObject : une appli d'avant R6a qui l'enverrait encore re\u00e7oit un refus net (sec-M4).
    expect(ProjectInput.safeParse({ ...valid, timeSpent: 'week' }).success).toBe(false)
    expect(ProjectChanges.safeParse({ timeSpent: 'week' }).success).toBe(false)
    expect(ProjectChanges.safeParse({ timeSpent: null }).success).toBe(false)
  })
})

describe('\u00ab Facile \u00e0 refaire ? \u00bb (R6a)', () => {
  it('accepts the three levels, or none', () => {
    for (const difficulty of ['easy', 'medium', 'hard', null]) {
      expect(ProjectChanges.safeParse({ difficulty }).success).toBe(true)
    }
    expect(ProjectChanges.safeParse({ difficulty: 'expert' }).success).toBe(false)
  })
})

describe('\u00ab Commenc\u00e9 en \u00bb (R6a)', () => {
  // Une heure fig\u00e9e : le mois en cours ne d\u00e9pend plus du jour o\u00f9 l'on lance les tests. Seule Date
  // est simul\u00e9e (les minuteurs restent r\u00e9els).
  afterEach(() => vi.useRealTimers())
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
  }

  it('accepts January 2000 and the current month, refuses December 1999 and the next month', () => {
    at('2026-11-15T12:00:00Z')

    expect(StartedMonth.safeParse('2000-01').success).toBe(true)
    expect(StartedMonth.safeParse('2026-03').success).toBe(true)
    expect(StartedMonth.safeParse('2026-11').success).toBe(true)
    expect(StartedMonth.safeParse('1999-12').success).toBe(false)
    expect(StartedMonth.safeParse('2026-12').success).toBe(false)
    expect(StartedMonth.safeParse('2027-01').success).toBe(false)
  })

  it('refuses a started month with non-ASCII digits, a one-digit month, month 00 or 13, or a full date', () => {
    at('2026-11-15T12:00:00Z')
    // Des chiffres d'autres \u00e9critures : pleine chasse (\u00ab \uff12 \u00bb) et arabes orientaux (\u00ab \u0662 \u00bb). Une
    // regex `\d` sans pr\u00e9caution peut les laisser passer selon le moteur.
    const fullWidth = '\uff12\uff10\uff12\uff16-\uff10\uff13'
    const arabicIndic = `${String.fromCodePoint(0x0662, 0x0660, 0x0662, 0x0666)}-03`

    for (const month of [
      fullWidth,
      arabicIndic,
      '2026-3',
      '2026-00',
      '2026-13',
      '2026-03-01',
      '2026-03-01T00:00:00Z',
      '03-2026',
      ' 2026-03',
      '',
    ]) {
      expect(StartedMonth.safeParse(month).success, month).toBe(false)
    }
  })

  it('accepts the month already begun in Kiritimati (2026-11-30T10:00Z \u2192 \u00ab 2026-12 \u00bb) and refuses it a minute earlier', () => {
    // \u00c0 10 h UTC le 30 novembre, il est minuit le 1er d\u00e9cembre \u00e0 Kiritimati (UTC+14) : un membre
    // l\u00e0-bas voit d\u00e9j\u00e0 d\u00e9cembre sur son calendrier.
    at('2026-11-30T10:00:00Z')
    expect(startedMonthMax(new Date())).toBe('2026-12')
    expect(StartedMonth.safeParse('2026-12').success).toBe(true)
    expect(ProjectChanges.safeParse({ startedOn: '2026-12' }).success).toBe(true)

    at('2026-11-30T09:59:00Z')
    expect(startedMonthMax(new Date())).toBe('2026-11')
    expect(StartedMonth.safeParse('2026-12').success).toBe(false)
    expect(ProjectChanges.safeParse({ startedOn: '2026-12' }).success).toBe(false)
  })

  it('lets an update clear the month, and a creation leave it out', () => {
    at('2026-11-15T12:00:00Z')
    expect(ProjectChanges.parse({ startedOn: null })).toEqual({ startedOn: null })
    expect(ProjectInput.parse(valid)).not.toHaveProperty('startedOn')
  })
})

describe('the description of a photo (R6a)', () => {
  // Les invisibles s'\u00e9crivent par leur num\u00e9ro : \u00e9crits tels quels, ils dispara\u00eetraient \u00e0 la lecture.
  const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
  const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)

  it('accepts 250 characters, emoji counted as one, and refuses 251', () => {
    expect(PHOTO_DESCRIPTION_MAX).toBe(250)
    expect(VisualUpdate.safeParse({ description: '\u00e9'.repeat(250) }).success).toBe(true)
    expect(VisualUpdate.safeParse({ description: '\ud83d\udc1d'.repeat(250) }).success).toBe(true)
    expect(VisualUpdate.safeParse({ description: '\u00e9'.repeat(251) }).success).toBe(false)
  })

  it('refuses invisible characters', () => {
    for (const invisible of [ZERO_WIDTH_SPACE, RIGHT_TO_LEFT_OVERRIDE]) {
      expect(VisualUpdate.safeParse({ description: `Le frigo${invisible} ouvert` }).success).toBe(
        false,
      )
    }
  })

  it('turns an empty description into \u00ab no description \u00bb', () => {
    expect(VisualUpdate.parse({ description: '' })).toEqual({ description: null })
    expect(VisualUpdate.parse({ description: '   ' })).toEqual({ description: null })
    expect(VisualUpdate.parse({ description: null })).toEqual({ description: null })
    expect(VisualUpdate.parse({ description: '  Le frigo ouvert  ' })).toEqual({
      description: 'Le frigo ouvert',
    })
  })

  it('accepts the description alone, nothing else about the photo', () => {
    expect(VisualUpdate.safeParse({}).success).toBe(false)
    expect(VisualUpdate.safeParse({ description: 'Le frigo', position: 0 }).success).toBe(false)
    expect(VisualUpdate.safeParse({ description: 'Le frigo', slot: 'portrait' }).success).toBe(
      false,
    )
  })
})
