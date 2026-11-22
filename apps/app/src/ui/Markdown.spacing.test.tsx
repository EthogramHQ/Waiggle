// Tests de la ponctuation dans le Markdown d'un membre (R18, scénario « Les textes des membres bien
// ponctués ») : l'espace tapée devant ? ! : ; devient insécable dans le texte affiché, jamais dans le
// code (un extrait de code se lit tel qu'il a été écrit) ni dans l'adresse d'un lien (elle s'ouvre
// telle qu'elle a été écrite).
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut de l'arbre rendu, caractère par caractère.
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Markdown } from './Markdown'

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)
/** L'espace insécable (U+00A0), devant : */
const NBSP = String.fromCodePoint(0x00a0)

const onLinkPress = jest.fn()
beforeEach(() => onLinkPress.mockReset())

/** Tout le texte affiché, sans rien ramener : les chaînes de l'arbre, dans l'ordre. */
type Rendered = string | { children?: Rendered[] | null } | Rendered[] | null
const rawText = (node: Rendered): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(rawText).join('')
  return (node.children ?? []).map(rawText).join('')
}
const shown = () => rawText(screen.toJSON() as Rendered)

const show = (text: string) => render(<Markdown text={text} onLinkPress={onLinkPress} />)

describe('Markdown, the punctuation of a member', () => {
  it('keeps the typed space before ? ! : non-breaking in the text', async () => {
    await show('Ça marche ? Oui ! **Note :** à tester')

    expect(shown()).toContain(`marche${NNBSP}?`)
    expect(shown()).toContain(`Oui${NNBSP}!`)
    expect(shown()).toContain(`Note${NBSP}:`)
    expect(shown()).not.toContain('marche ?')
  })

  it('leaves the code as it was written', async () => {
    await show('Lance `npm start ?` puis :\n\n```\nok = a ? b : c\n```')

    // Le code garde ses espaces ordinaires…
    expect(shown()).toContain('npm start ?')
    expect(shown()).toContain('ok = a ? b : c')
    // … le texte autour, lui, est protégé (témoin que la règle est bien posée).
    expect(shown()).toContain(`puis${NBSP}:`)
  })

  it('adds nothing where the member typed no space', async () => {
    await show('Oui! Rendez-vous à 10:30.')

    expect(shown()).toContain('Oui! Rendez-vous à 10:30.')
  })

  it('opens a link at the address as written, with a space before the punctuation', async () => {
    await show('[Démo ?](https://example.com/a?b=1)\n\nVa sur https://example.com/x !')

    // Le texte du lien et la phrase sont protégés…
    expect(shown()).toContain(`Démo${NNBSP}?`)
    expect(shown()).toContain(`https://example.com/x${NNBSP}!`)
    // … mais les adresses s'ouvrent telles qu'elles ont été écrites.
    await fireEvent.press(screen.getByRole('link', { name: /^Démo/ }))
    await fireEvent.press(screen.getByRole('link', { name: 'https://example.com/x' }))

    expect(onLinkPress).toHaveBeenNthCalledWith(1, 'https://example.com/a?b=1')
    expect(onLinkPress).toHaveBeenNthCalledWith(2, 'https://example.com/x')
  })
})
