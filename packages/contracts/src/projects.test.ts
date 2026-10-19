// Tests des règles d'un projet : ce qu'un membre peut publier, et quels liens de démo sont acceptés.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from './errors'
import {
  DemoUrl,
  Project,
  ProjectInput,
  ProjectSummary,
  ProjectUpdate,
  ProjectVisual,
  publicHttpsUrl,
  Thumbhash,
  VisualSlot,
} from './projects'
import { NO_REACTIONS } from './reactions'

const valid = {
  title: 'Mon agent de recettes',
  pitch: 'Il propose un menu avec ce qu’il y a au frigo.',
}

describe('ProjectInput', () => {
  it('only needs a title and a pitch', () => {
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

  it('only accepts the known statuses, visibilities and time spans', () => {
    expect(ProjectInput.safeParse({ ...valid, status: 'testable' }).success).toBe(true)
    expect(ProjectInput.safeParse({ ...valid, status: 'abandonné' }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, visibility: 'friends' }).success).toBe(false)
    expect(ProjectInput.safeParse({ ...valid, timeSpent: 'weekend' }).success).toBe(true)
    expect(ProjectInput.safeParse({ ...valid, timeSpent: '3h' }).success).toBe(false)
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

describe('ProjectUpdate', () => {
  it('accepts a change of a single field, and removing the demo link', () => {
    expect(ProjectUpdate.parse({ status: 'done' })).toEqual({ status: 'done' })
    expect(ProjectUpdate.parse({ demoUrl: null })).toEqual({ demoUrl: null })
  })

  it('accepts a new order of the photos: at most six, each one once', () => {
    const ids = Array.from({ length: 7 }, () => crypto.randomUUID())
    expect(ProjectUpdate.parse({ visualOrder: ids.slice(0, 6) })).toEqual({
      visualOrder: ids.slice(0, 6),
    })
    expect(ProjectUpdate.safeParse({ visualOrder: ids }).success).toBe(false)
    expect(ProjectUpdate.safeParse({ visualOrder: [ids[0], ids[0]] }).success).toBe(false)
    expect(ProjectUpdate.safeParse({ visualOrder: ['../secrets'] }).success).toBe(false)
  })
})

// Les visuels viennent de l'API : l'appli les vérifie avant de les afficher (ADR 0002).
const visual = {
  id: '2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
  kind: 'image',
  url: 'https://api.waiggle.io/media/visuals/2f8c1d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f.webp',
  width: 1600,
  height: 900,
  // Le ThumbHash d'une vraie image : une vingtaine d'octets, écrits en base64.
  thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
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
    timeSpent: null,
    prompts: [],
    isMine: true,
    isFollowed: false,
    followerCount: 0,
    notes: [],
    reactions: NO_REACTIONS,
    commentCount: 0,
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
    const summary = ProjectSummary.parse({ ...project, cover: visual, portraitCover: null })
    expect(summary).toMatchObject({ cover: visual, portraitCover: null })
    expect(summary).not.toHaveProperty('visuals')
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
    // « https://waiggle.io@pirate.example.com » mène en réalité à pirate.example.com.
    expect(accepted('https://waiggle.io@pirate.example.com')).toBe(false)
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
