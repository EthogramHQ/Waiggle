// Tests du paquet de traductions.
// Vitest fournit trois briques : `describe` regroupe des tests, `it` décrit un comportement
// attendu, `expect(valeur)` vérifie ce comportement (toBe, toEqual…).
import { appName } from '@ruche/brand'
import { describe, expect, it } from 'vitest'
import { defaultLanguage, fill, parseAcceptLanguage, resolveLanguage, resources } from './index'

// Un arbre de traductions : chaque valeur est soit un texte, soit un sous-arbre.
type Tree = { [key: string]: string | Tree }

// Aplatit l'arbre en une liste « chemin → texte », par exemple :
// { home: { title: 'Bienvenue' } }  →  { 'home.title': 'Bienvenue' }
// C'est plus simple à comparer d'une langue à l'autre.
const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') acc[path] = value
    else Object.assign(acc, flatten(value, path)) // sous-arbre : on descend d'un niveau
    return acc
  }, {})

// Extrait les paramètres d'un texte : 'Bienvenue sur {{appName}}' → ['appName'].
// Si l'anglais oubliait {{appName}}, le nom de l'appli disparaîtrait de l'écran.
const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  const fr = flatten(resources.fr.translation)
  const en = flatten(resources.en.translation)

  it('has exactly the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
  })

  it('never says that other tools are checked every week', () => {
    // Relecture juridique du plan R6b (jur-T3) : « vérifiés chaque semaine » promettait un délai que
    // rien ne tient, et un contrôle de l'outil ; les « Autre » d'un projet privé ne sont relus par
    // personne. Seul le sujet du récapitulatif des administrateurs parle de « la semaine ».
    // \p{L} (drapeau u) : toute lettre, accentuée comprise (« vérifiés ») ; \w ne connaît que l'ASCII.
    const promise = /(vérifi|relu)\p{L}*\s+chaque\s+semaine|(checked|reviewed)\s+every\s+week/iu
    // Témoin : l'ancienne phrase serait bien trouvée.
    expect(promise.test('Vérifiés chaque semaine avant d’entrer au catalogue.')).toBe(true)
    expect(promise.test('Checked every week before they join the catalogue.')).toBe(true)
    for (const [key, text] of [...Object.entries(fr), ...Object.entries(en)]) {
      expect(promise.test(text), `${key} : ${text}`).toBe(false)
    }
  })

  it('has no empty text', () => {
    for (const [key, text] of [...Object.entries(fr), ...Object.entries(en)]) {
      // Le second argument d'expect est le message affiché si le test échoue.
      expect(text.trim(), `empty text for ${key}`).not.toBe('')
    }
  })

  it('never writes the app name by hand, so renaming the app takes one line', () => {
    // Le nom affiché et le nom de code (« @ruche/… », « ruche-api ») : ni l'un ni l'autre ne doit
    // apparaître dans un texte. Le mot « ruche » seul est permis depuis R3 : les ruches sont une
    // fonction de l'appli (des groupes de proches), nommée ainsi dans le scénario validé.
    for (const [key, text] of [...Object.entries(fr), ...Object.entries(en)]) {
      expect(text, `write {{appName}} instead in ${key}`).not.toMatch(
        new RegExp(`${appName}|@ruche|ruche-(api|web)`, 'i'),
      )
    }
  })

  it('uses the same placeholders in both languages', () => {
    for (const key of Object.keys(fr)) {
      expect(placeholders(en[key] ?? ''), `placeholders differ for ${key}`).toEqual(
        placeholders(fr[key] ?? ''),
      )
    }
  })

  // R6a (relecture du plan, jur-J5) : « public » est gardé pour R12, « Public sur le web ». Les
  // phrases qui disent qui voit un projet parlent des « membres », dans les deux langues.
  it('never calls a project visible to members « public » in the sentences about who sees it', () => {
    const audienceKeys = [
      'project.form.membersHint',
      'project.form.privateHint',
      'project.form.audienceMembers',
      'project.form.audienceMembersEdit',
      'project.form.audiencePrivateNew',
      'project.form.audiencePrivate',
      'project.form.draftSaved',
      'project.page.privateBanner',
      'project.updates.hintPrivate',
      'project.comments.hintPrivate',
      'project.comments.replyHintPrivate',
    ]
    for (const key of audienceKeys) {
      expect(fr[key], `missing ${key}`).toBeDefined()
      expect(fr[key], `say « visible des membres » in ${key}`).not.toMatch(/\bpublic\b/i)
      expect(en[key], `say « visible to members » in ${key}`).not.toMatch(/\bpublic\b/i)
    }
  })

  // R6b (restes de R5b) : en français, « de » devant un prénom s'élide ou non selon sa première
  // lettre (« d’Inès », « d’Hugo », mais « de Léa ») ; seul {{nameOf}} le sait (`nameOf`, ./index).
  // « Commentaire de {{name}} » ferait lire « de Inès ». Les paramètres qui portent le nom d'un
  // membre sont {{name}} et {{admin}} ; « de {{title}} » ou « de {{appName}} » ne sont pas visés.
  it('writes no « de {{name}} » in French texts: {{nameOf}} instead', () => {
    // `\b` : « de » est un mot entier (« code {{name}} » passerait) ; `\s` couvre les insécables.
    const unelided = /\b(?:de|d['’])\s*{{\s*(?:name|admin)\s*}}/i
    // Témoin : l'expression reconnaît les trois écritures fautives, et laisse passer {{nameOf}}.
    for (const sample of [
      'Actions du commentaire de {{name}}',
      'Commentaire d’{{name}}',
      "Lever la suspension d'{{ admin }}",
    ]) {
      expect(sample).toMatch(unelided)
    }
    expect('Commentaire {{nameOf}} : {{excerpt}}').not.toMatch(unelided)

    const offending = Object.entries(fr)
      .filter(([, text]) => unelided.test(text))
      .map(([key, text]) => `${key}: ${text}`)
    expect(offending, 'write {{nameOf}} instead').toEqual([])

    // Les textes passés à {{nameOf}} au commit du contrat (R6b, puis R7b) le gardent.
    for (const key of [
      'project.comments.menu',
      'project.comments.openLine',
      'moderation.suspend.title',
      'moderation.lift.title',
      // R7b (interface B5) : les textes du coin des testeurs qui nomment un membre après « de ».
      'project.testers.feedback.byAuthor',
      'project.testers.feedback.captureName',
      'project.testers.thread.pageTitle',
      'project.testers.thread.feedbackOf',
      'project.testers.thread.replyOf',
      'project.testers.thread.menuNoText',
    ]) {
      expect(fr[key], `missing ${key}`).toContain('{{nameOf}}')
    }
  })
})

describe('resolveLanguage', () => {
  it('falls back to French when nothing is preferred', () => {
    expect(resolveLanguage([])).toBe(defaultLanguage)
    expect(defaultLanguage).toBe('fr')
  })

  it('matches a regional variant to its base language', () => {
    expect(resolveLanguage(['en-US'])).toBe('en')
    expect(resolveLanguage(['fr-CA'])).toBe('fr')
  })

  it('keeps the first supported language in order of preference', () => {
    expect(resolveLanguage(['de-DE', 'en-GB', 'fr'])).toBe('en')
  })

  it('ignores case', () => {
    expect(resolveLanguage(['EN'])).toBe('en')
  })

  it('falls back to French when no preference is supported', () => {
    expect(resolveLanguage(['de', 'es-ES'])).toBe('fr')
  })
})

describe('parseAcceptLanguage', () => {
  // L'en-tête Accept-Language est envoyé par chaque navigateur, par exemple :
  // "en-US,en;q=0.9,fr;q=0.8" = « anglais américain, sinon anglais (90 %), sinon français (80 %) ».
  it('returns nothing for a missing or empty header', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([])
    expect(parseAcceptLanguage('')).toEqual([])
  })

  it('orders languages by quality, keeping header order on ties', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,fr;q=0.8')).toEqual(['en-US', 'en', 'fr'])
    expect(parseAcceptLanguage('fr;q=0.5, en;q=0.9')).toEqual(['en', 'fr'])
  })

  it('drops languages explicitly refused with q=0 and the wildcard', () => {
    expect(parseAcceptLanguage('en;q=0, fr, *;q=0.1')).toEqual(['fr'])
  })
})

describe('fill', () => {
  it('fills the app name in every text without being asked', () => {
    expect(fill('Bienvenue sur {{appName}}')).toBe(`Bienvenue sur ${appName}`)
  })

  it('fills the given parameters and blanks the unknown ones', () => {
    expect(fill('Bonjour {{ name }}{{missing}}', { name: 'Léa' })).toBe('Bonjour Léa')
  })

  // Le nom d'un membre arrive dans les e-mails : un {{…}} qu'il a tapé reste tel quel.
  it('shows the given values as typed, even when they contain {{…}}', () => {
    expect(fill('{{name}}, {{appName}}', { name: '{{appName}} {{name}} $&' })).toBe(
      `{{appName}} {{name}} $&, ${appName}`,
    )
  })

  it('never fills in what every JavaScript object inherits', () => {
    expect(fill('[{{constructor}}][{{toString}}][{{__proto__}}]')).toBe('[][][]')
  })
})
