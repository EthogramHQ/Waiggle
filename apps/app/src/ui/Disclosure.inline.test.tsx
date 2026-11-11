// Tests de la section repliable en ligne (`Disclosure variant="inline"`, R7b) : « 12 testeurs »,
// sous le titre du coin des testeurs, un simple texte et sa flèche qui déplie la liste posée
// dessous. Elle se comporte comme la carte : un bouton nommé par son titre, qui dit s'il est déplié,
// et un contenu qui n'existe pas tant qu'il est replié.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Disclosure } from './Disclosure'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const TITLE = '12 testeurs'
const CONTENT = 'Inès Morel'

type Host = { props: Record<string, unknown> }
const expanded = (node: Host): unknown =>
  (node.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded

describe('Disclosure inline', () => {
  it('unfolds its content from a button named by its title, and says so', async () => {
    await renderWithProviders(
      <Disclosure title={TITLE} icon={null} variant="inline">
        <Text>{CONTENT}</Text>
      </Disclosure>,
    )
    const toggle = () => screen.getByRole('button', { name: TITLE })

    expect(expanded(toggle())).toBe(false)
    expect(screen.queryByText(CONTENT)).toBeNull()

    await fireEvent.press(toggle())

    expect(expanded(toggle())).toBe(true)
    expect(screen.getByText(CONTENT)).toBeTruthy()

    await fireEvent.press(toggle())

    expect(expanded(toggle())).toBe(false)
    expect(screen.queryByText(CONTENT)).toBeNull()
  })

  it('writes its title once, as a plain caption, without the card hint', async () => {
    await renderWithProviders(
      <Disclosure title={TITLE} hint="Une aide de la carte" variant="inline">
        <Text>{CONTENT}</Text>
      </Disclosure>,
    )

    expect(screen.getAllByText(TITLE)).toHaveLength(1)
    expect(screen.queryByText('Une aide de la carte')).toBeNull()
  })
})
