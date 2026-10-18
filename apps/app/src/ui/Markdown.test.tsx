// Tests du rendu Markdown : la mise en forme s'affiche, et rien de dangereux ne passe.
// Les descriptions sont écrites par les membres : on les traite comme du texte non fiable.
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Markdown } from './Markdown'

const onLinkPress = jest.fn()

// La profondeur de l'arbre affiché : combien d'éléments imbriqués les uns dans les autres.
type Rendered = string | { children?: Rendered[] | null } | Rendered[] | null
const depthOf = (node: Rendered): number => {
  if (node === null || typeof node === 'string') return 0
  if (Array.isArray(node)) return Math.max(0, ...node.map(depthOf))
  return 1 + Math.max(0, ...(node.children ?? []).map(depthOf))
}
beforeEach(() => onLinkPress.mockReset())

const show = (text: string) => render(<Markdown text={text} onLinkPress={onLinkPress} />)

describe('Markdown', () => {
  it('shows headings, emphasis, lists and code', async () => {
    await show(
      '## Comment ça marche\n\nOn **photographie** le frigo.\n\n1. un\n2. deux\n\n`npm start`',
    )

    expect(screen.getByRole('header', { name: 'Comment ça marche' })).toBeTruthy()
    expect(screen.getByText('photographie')).toBeTruthy()
    expect(screen.getByText('1.')).toBeTruthy()
    expect(screen.getByText('deux')).toBeTruthy()
    expect(screen.getByText('npm start')).toBeTruthy()
  })

  it('opens https links through the warning page handler', async () => {
    await show('Voir [le site](https://recettes.example.com) ou https://autre-site.example.org')

    await fireEvent.press(screen.getByRole('link', { name: 'le site' }))
    await fireEvent.press(screen.getByRole('link', { name: 'https://autre-site.example.org' }))

    expect(onLinkPress).toHaveBeenNthCalledWith(1, 'https://recettes.example.com/')
    expect(onLinkPress).toHaveBeenNthCalledWith(2, 'https://autre-site.example.org/')
  })

  it('never makes a link clickable unless it is https', async () => {
    await show('[clique](javascript:alert(1)) [pas sûr](http://site.example)')

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('clique pas sûr')).toBeTruthy() // du texte simple
  })

  it('shows HTML as plain text instead of running it', async () => {
    await show('<script>alert(1)</script>')

    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy()
  })

  it('never loads an image, which could track whoever reads the page', async () => {
    await show('![photo](https://tracker.example/pixel.png)')

    expect(screen.getByText('photo')).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).not.toContain('tracker.example')
  })

  it('turns entities back into characters', async () => {
    await show('Pain &amp; fromage')

    expect(screen.getByText('Pain & fromage')).toBeTruthy()
  })

  it('survives a description nested thousands of times, which used to crash the page', async () => {
    // Une citation dans une citation dans une citation… (« >>>>> x ») : de quoi épuiser la pile
    // d'appels de l'analyseur, ou dessiner des milliers de cadres imbriqués.
    for (const text of [
      `${'>'.repeat(3000)} x`,
      `${'>'.repeat(900)} x`,
      `${'- '.repeat(1500)}x`,
      `${'*'.repeat(3000)}x${'*'.repeat(3000)}`, // gras dans de l'italique dans du gras…
    ]) {
      await show(text)
      // Quelle que soit l'imbrication tapée, l'affichage reste borné à quelques niveaux.
      expect(depthOf(screen.toJSON() as Rendered)).toBeLessThanOrEqual(30)
    }
  })

  it('removes invisible characters written as entities', async () => {
    // « &#x202E; » est une autre façon d'écrire le caractère qui retourne le texte.
    await show('abc&#x202E;def')

    expect(screen.getByText('abcdef')).toBeTruthy()
  })

  it('shows entities inside code exactly as typed', async () => {
    await show('`&amp;`')

    expect(screen.getByText('&amp;')).toBeTruthy()
  })

  it('never makes a link clickable unless it leads to a public website', async () => {
    await show(
      '[ref][x] [box](https://192.168.1.1) [faux](https://waiggle.io@pirate.example.com)\n\n[x]: javascript:alert(1)',
    )

    expect(screen.queryByRole('link')).toBeNull()
  })
})
