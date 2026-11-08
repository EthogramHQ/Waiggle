// Tests de la mise en place des traductions : un texte écrit par un membre (titre, nom, outil,
// adresse d'un site) doit s'afficher tel qu'il l'a tapé, même s'il contient des {{…}}.
import { appName } from '@ruche/brand'
import { fill, resources } from '@ruche/i18n'
import { createI18n } from './i18n'

// Un arbre de traductions : chaque valeur est soit un texte, soit un sous-arbre.
type Tree = { [key: string]: string | Tree }

// Aplatit l'arbre en une liste de couples [chemin, texte] : { home: { title: '…' } } → [['home.title', '…']].
const flatten = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value] as [string, string]] : flatten(value, path)
  })

// Les paramètres d'un texte : 'Retirer {{item}}' → ['item'].
const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1] ?? '')

describe('member content in translated texts', () => {
  const { t } = createI18n('fr')

  it('shows a tool or a title containing {{appName}} as typed', () => {
    expect(t(($) => $.common.remove, { item: 'Hello {{appName}}' })).toBe(
      'Retirer Hello {{appName}}',
    )
    expect(t(($) => $.project.page.deleteTitle, { title: 'Mon {{appName}}' })).toBe(
      // Les espaces typographiques du français : une insécable (U+00A0) dans les guillemets, une fine (U+202F) avant le point d’interrogation.
      'Supprimer «\u00a0Mon {{appName}}\u00a0»\u202f?',
    )
  })

  it('shows a member text as typed even when it names a placeholder further in the text', () => {
    // i18next remplaçait ici le {{appName}} tapé par le membre, et laissait le vrai vide.
    expect(t(($) => $.project.page.external, { host: '{{appName}}' })).toBe(
      `{{appName}}, un site hors de ${appName}`,
    )
  })

  it('never reads a member text as a nested translation', () => {
    expect(t(($) => $.common.remove, { item: '$t(common.cancel)' })).toBe(
      'Retirer $t(common.cancel)',
    )
  })

  // Audit de sécurité du 25/10/2026, C3 (test écrit le 7/11) : avant i18next 26.4.4, un « $t( »
  // jamais fermé dans un texte de membre (un titre, un nom) faisait tourner sa recherche si
  // longtemps que la page se figeait chez qui la lisait.
  it('shows at once a member text full of « $t( » never closed', () => {
    const typed = '$t('.repeat(30000)
    const start = performance.now()

    const shown = t(($) => $.common.remove, { item: typed })

    expect(shown).toBe(`Retirer ${typed}`)
    // Un rendu ordinaire prend moins d'une milliseconde ; la faille, des secondes ou plus.
    expect(performance.now() - start).toBeLessThan(500)
  })

  // Pour chaque texte de l'appli, dans chaque langue : chaque paramètre reçoit un texte piégé qui
  // cite tous les paramètres du texte. Le résultat attendu est celui d'un simple remplacement.
  it.each(['fr', 'en'] as const)('shows member content as typed in every %s text', (language) => {
    const i18n = createI18n(language)
    const texts = flatten(resources[language].translation).filter(([, text]) => {
      const names = placeholders(text)
      // {{count}} choisit le singulier ou le pluriel : c'est toujours un nombre, jamais un texte.
      return names.some((name) => name !== 'appName') && !names.includes('count')
    })
    expect(texts.length).toBeGreaterThan(0)
    for (const [key, text] of texts) {
      const trap = placeholders(text)
        .map((name) => `{{${name}}}`)
        .join(' ')
      const values = Object.fromEntries(
        placeholders(text)
          .filter((name) => name !== 'appName')
          .map((name) => [name, `${trap} {{appName}} $`]),
      )
      // `as never` : la clé vient d'une boucle, TypeScript ne peut pas la vérifier ici.
      expect([key, i18n.t(key as never, values)]).toEqual([key, fill(text, values)])
    }
  })
})
