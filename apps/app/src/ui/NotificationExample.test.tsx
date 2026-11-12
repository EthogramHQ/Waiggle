// Tests de l'exemple en tête de l'écran « Notifications » des réglages (R8, planche `R8-Reglages`,
// A3) : une fausse notification de téléphone, sans nom de membre, « {{appName}} · maintenant » puis
// « 12 réactions sur Raconte-moi un tableau », le titre en gras. Le composant écrit lui-même ses
// textes (`notificationSettings.exampleSource`, `exampleText`) : il n'a aucune prop. Ce n'est qu'une
// illustration : ni bouton ni lien.
import { appName } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { NotificationExample } from './NotificationExample'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const SOURCE = fr.t(($) => $.notificationSettings.exampleSource, { appName })
const TITLE = 'Raconte-moi un tableau'

type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }
const nodesOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]
/** Tous les textes écrits à l'écran, bout à bout. */
const allText = () =>
  nodesOf(screen.root as unknown as Node)
    .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string'))
    .join('')
/** Vrai si ce texte est écrit en gras (selon la plateforme, par la graisse ou par la police). */
const bold = (node: Node) => {
  const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
  return /semi|bold|600|700|800/i.test(`${style.fontFamily ?? ''} ${style.fontWeight ?? ''}`)
}

describe('NotificationExample', () => {
  it('names the app as the source, with the name filled in', async () => {
    await renderWithProviders(<NotificationExample />)

    expect(screen.getByText(containing(SOURCE))).toBeTruthy()
    expect(allText()).not.toContain('{{appName}}')
  })

  it('reads « 12 réactions sur Raconte-moi un tableau », with no member named', async () => {
    await renderWithProviders(<NotificationExample />)

    expect(allText()).toContain('12 réactions sur Raconte-moi un tableau')
    // Les marques de gras du texte traduit ne s'affichent jamais.
    expect(allText()).not.toMatch(/<\/?b>/)
  })

  it('writes the title of the project in bold, and the rest not', async () => {
    await renderWithProviders(<NotificationExample />)

    expect(bold(screen.getByText(TITLE) as unknown as Node)).toBe(true)
    // Le titre peut être un texte imbriqué dans la phrase : on lit la vue qui écrit elle-même
    // « 12 réactions sur ».
    const rest = nodesOf(screen.root as unknown as Node).find((node) =>
      node.children.some((child) => typeof child === 'string' && /12 réactions/.test(child)),
    )
    expect(rest).toBeDefined()
    expect(bold(rest as Node)).toBe(false)
  })

  it('is an illustration only: neither a button nor a link', async () => {
    await renderWithProviders(<NotificationExample />)

    expect(screen.getByText(TITLE)).toBeTruthy() // témoin
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
