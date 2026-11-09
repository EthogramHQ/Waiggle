// Tests des règles du catalogue des outils (tranche R6b, docs/scenarios/refonte.md, « R6b », « Le
// catalogue ») : le repli qui reconnaît un même outil écrit de deux façons, l'identifiant d'un outil
// dans les adresses, le site d'un outil et les paramètres des listes. Ce sont des fonctions pures :
// pas de base, pas d'API.
//
// Règles venues des relectures du plan : sec-A3 (un repli jamais vide), sec-B5 (un slug sans barre
// ni point), sec-B7 (la recherche du catalogue de 2 à 80 caractères), jur-T7 (un site sans
// paramètre de suivi ni fragment).
import { describe, expect, it } from 'vitest'
import { CatalogueToolsQuery, ToolAdmit } from './moderation-catalogue'
import { ToolPage, ToolPageQuery } from './projects'
import { TOOL_SLUG_MAX, toolSlug } from './slug'
import { ShortLabel } from './text'
import {
  foldTool,
  OTHER_TOOLS_SHOWN,
  TOOL_DESCRIPTION_MAX,
  TOOL_FAMILIES,
  ToolFamily,
  ToolList,
  ToolSiteUrl,
  ToolSlug,
  uniqueTools,
} from './tools'

describe('foldTool', () => {
  it('folds the spellings of one tool to the same name', () => {
    // « Chat GPT », « chatgpt » et « ChatGPT » : le même outil (scénario, « Le catalogue »).
    expect(foldTool('Chat GPT')).toBe('chatgpt')
    expect(foldTool('chatgpt')).toBe('chatgpt')
    expect(foldTool('ChatGPT')).toBe('chatgpt')
    expect(foldTool('chat-gpt')).toBe('chatgpt')
    expect(foldTool('  CHAT_GPT. ')).toBe('chatgpt')
  })

  it('ignores accents and capitals', () => {
    expect(foldTool('Écrivain')).toBe('ecrivain')
    expect(foldTool('ecrivain')).toBe(foldTool('ÉCRIVAIN'))
  })

  it('keeps the digits and the letters of other alphabets', () => {
    // « GPT 4 » et « GPT 5 » restent deux outils ; un nom en japonais ne disparaît pas.
    expect(foldTool('GPT 4')).not.toBe(foldTool('GPT 5'))
    expect(foldTool('ノート')).toBe('ノート')
  })

  it('never folds a name to an empty string: two symbol-only names fold differently', () => {
    // Un nom fait seulement de ponctuation ne doit pas donner « » : deux tels noms différents
    // seraient sinon le même outil en base (relecture de sécurité sec-A3).
    expect(foldTool('---')).not.toBe('')
    expect(foldTool('+++')).not.toBe('')
    expect(foldTool('---')).not.toBe(foldTool('+++'))
    // Et le même nom donne toujours le même repli.
    expect(foldTool('---')).toBe(foldTool('---'))
  })

  it('gives a name already folded back unchanged', () => {
    // La base garde le repli : le replier à nouveau ne doit rien changer.
    for (const name of ['Chat GPT', 'Écrivain', 'Home Assistant', 'n8n']) {
      expect(foldTool(foldTool(name))).toBe(foldTool(name))
    }
  })
})

describe('uniqueTools', () => {
  it('keeps one copy of each tool, in order, with its first spelling', () => {
    expect(uniqueTools(['Chat GPT', 'Claude', 'ChatGPT', 'claude', 'Lovable'])).toEqual([
      'Chat GPT',
      'Claude',
      'Lovable',
    ])
  })

  it('keeps two different symbol-only names', () => {
    expect(uniqueTools(['---', '+++', '---'])).toEqual(['---', '+++'])
  })
})

describe('ToolSlug', () => {
  it('accepts letters and digits of every language separated by single dashes', () => {
    for (const slug of ['claude', 'claude-code', 'n8n', 'gpt-4o', 'écrivain', 'ノート']) {
      expect(ToolSlug.safeParse(slug).success, slug).toBe(true)
    }
  })

  it('refuses a slug with a slash or a dot', () => {
    // L'appli recopie le slug dans l'adresse : il ne doit rien pouvoir y glisser (sec-B5).
    for (const slug of ['a/b', '../admin', 'chat.gpt', '.', '..', 'a\\b']) {
      expect(ToolSlug.safeParse(slug).success, slug).toBe(false)
    }
  })

  it('refuses spaces, double or edge dashes, and an empty slug', () => {
    for (const slug of ['', 'claude code', 'claude--code', '-claude', 'claude-', 'a?b', 'a#b']) {
      expect(ToolSlug.safeParse(slug).success, slug).toBe(false)
    }
  })

  it('gives every ShortLabel(40) name a slug that ToolSlug accepts', () => {
    // Relecture de sécurité sec-A1 : l'adresse d'un « Autre » est vérifiée EN SORTIE par ToolSlug ;
    // une adresse trop longue faisait tomber en 500 la page « À vérifier » de tous les
    // administrateurs. Les pires noms de 40 caractères : 40 emoji (chacun devient « u1f916- », 7
    // caractères), 40 ligatures que NFKD déplie (« ﷺ » donne une phrase de 18 lettres, « ﷲ » un mot
    // de 4 lettres sans espace), 40 lettres hors du plan de base (2 unités UTF-16 chacune).
    const worst = [
      String.fromCodePoint(0x1f916).repeat(40),
      String.fromCodePoint(0xfdfa).repeat(40),
      String.fromCodePoint(0xfdf2).repeat(40),
      String.fromCodePoint(0x20000).repeat(40),
      'a '.repeat(20).trim(),
      `${'x'.repeat(39)}${String.fromCodePoint(0x1f916)}`,
    ]
    for (const name of worst) {
      expect(ShortLabel(40).safeParse(name).success, name).toBe(true)
      const slug = toolSlug(name)
      expect(ToolSlug.safeParse(slug).success, slug).toBe(true)
      expect(Array.from(slug).length, slug).toBeLessThanOrEqual(TOOL_SLUG_MAX)
      // La place d'un suffixe (« -51 », la dernière adresse que l'API essaie) reste dans la borne.
      expect(ToolSlug.safeParse(`${slug}-51`).success, slug).toBe(true)
    }
  })
})

describe('ToolSiteUrl', () => {
  it('accepts the https address of a public site', () => {
    expect(ToolSiteUrl.parse('https://lovable.dev')).toBe('https://lovable.dev/')
    expect(ToolSiteUrl.parse('  https://www.home-assistant.io/  ')).toBe(
      'https://www.home-assistant.io/',
    )
    expect(ToolSiteUrl.parse('https://claude.ai/code')).toBe('https://claude.ai/code')
  })

  it('refuses http, javascript and other schemes', () => {
    for (const url of [
      'http://lovable.dev',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,hello',
      'ftp://lovable.dev',
      'lovable.dev',
    ]) {
      expect(ToolSiteUrl.safeParse(url).success, url).toBe(false)
    }
  })

  it('refuses a private, local or numeric address', () => {
    for (const url of [
      'https://192.168.1.1',
      'https://10.0.0.1/admin',
      'https://127.0.0.1',
      'https://0x7f.1',
      'https://[::1]',
      'https://localhost',
      'https://nas.local',
      'https://waiggle.com@pirate.example.com',
    ]) {
      expect(ToolSiteUrl.safeParse(url).success, url).toBe(false)
    }
  })

  it('refuses a site address with a query string or a fragment', () => {
    // Un paramètre ou un fragment porte souvent un suivi ou une affiliation (jur-T7) ; même vides
    // (« ? » ou « # » seuls), ils n'ont rien à faire dans l'adresse d'un site officiel.
    for (const url of [
      'https://lovable.dev/?ref=waiggle',
      'https://lovable.dev?utm_source=waiggle',
      'https://lovable.dev/#pricing',
      'https://lovable.dev/?',
      'https://lovable.dev/#',
    ]) {
      expect(ToolSiteUrl.safeParse(url).success, url).toBe(false)
    }
  })
})

describe('ToolAdmit', () => {
  const lovable = {
    name: 'Lovable',
    family: 'no-code',
    descriptionFr: 'Crée une application web à partir d’une description.',
    descriptionEn: 'Builds a web app from a description.',
    siteUrl: 'https://lovable.dev',
  }

  it('accepts a tool with its two descriptions, and no site', () => {
    expect(ToolAdmit.safeParse(lovable).success).toBe(true)
    expect(ToolAdmit.safeParse({ ...lovable, siteUrl: null }).success).toBe(true)
  })

  it('refuses a description longer than 160 characters, a 41-character name, an unknown family', () => {
    const long = 'é'.repeat(TOOL_DESCRIPTION_MAX)
    expect(ToolAdmit.safeParse({ ...lovable, descriptionFr: long }).success).toBe(true)
    expect(ToolAdmit.safeParse({ ...lovable, descriptionEn: `${long}e` }).success).toBe(false)
    expect(ToolAdmit.safeParse({ ...lovable, name: 'L'.repeat(41) }).success).toBe(false)
    expect(ToolAdmit.safeParse({ ...lovable, family: 'magic' }).success).toBe(false)
  })

  it('refuses a site with a tracking parameter, and any field it does not know', () => {
    expect(ToolAdmit.safeParse({ ...lovable, siteUrl: 'https://lovable.dev/?ref=x' }).success).toBe(
      false,
    )
    expect(ToolAdmit.safeParse({ ...lovable, status: 'catalogue' }).success).toBe(false)
  })
})

describe('the tool families', () => {
  it('lists the seven families of the scenario, in the order of the pills', () => {
    expect(TOOL_FAMILIES).toEqual([
      'assistant',
      'creation',
      'no-code',
      'development',
      'automation',
      'smart-home',
      'hardware',
    ])
    expect(ToolFamily.safeParse('ai').success).toBe(false)
  })
})

describe('the lists and the tool page', () => {
  it('refuses a catalogue search of one character and of 81 characters', () => {
    // sec-B7 : une recherche d'un caractère lirait tout le catalogue ; 80 au plus.
    expect(CatalogueToolsQuery.safeParse({ q: 'c' }).success).toBe(false)
    expect(CatalogueToolsQuery.safeParse({ q: 'c'.repeat(81) }).success).toBe(false)
    expect(CatalogueToolsQuery.safeParse({ q: 'cl' }).success).toBe(true)
    expect(CatalogueToolsQuery.safeParse({ q: 'c'.repeat(80) }).success).toBe(true)
    expect(CatalogueToolsQuery.safeParse({}).success).toBe(true)
  })

  it('keeps at most 50 « other » tools in the list', () => {
    const others = Array.from({ length: OTHER_TOOLS_SHOWN + 1 }, (_, i) => ({ name: `Outil ${i}` }))
    expect(ToolList.safeParse({ tools: [], others: others.slice(1) }).success).toBe(true)
    expect(ToolList.safeParse({ tools: [], others }).success).toBe(false)
  })

  it('takes a status among testable and done, and a well-formed category, on a tool page', () => {
    expect(ToolPageQuery.parse({ status: 'testable', category: 'cooking' })).toEqual({
      status: 'testable',
      category: 'cooking',
    })
    expect(ToolPageQuery.safeParse({ status: 'idea' }).success).toBe(false)
    expect(ToolPageQuery.safeParse({ category: 'Cuisine' }).success).toBe(false)
    expect(ToolPageQuery.safeParse({ cursor: 'a b' }).success).toBe(false)
  })

  it('refuses a tool page whose slug could slip into an address', () => {
    const page = {
      tool: {
        slug: 'lovable',
        name: 'Lovable',
        family: 'no-code',
        description: null,
        siteUrl: null,
        projectCount: 0,
      },
      categories: [],
      projects: [],
      nextCursor: null,
    }
    expect(ToolPage.safeParse(page).success).toBe(true)
    expect(ToolPage.safeParse({ ...page, tool: { ...page.tool, slug: '../x' } }).success).toBe(
      false,
    )
    // Une catégorie listée a au moins un projet.
    expect(
      ToolPage.safeParse({ ...page, categories: [{ code: 'cooking', projectCount: 0 }] }).success,
    ).toBe(false)
  })
})
