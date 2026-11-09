// Tests de l'en-tête d'un outil, après la relecture de R6b (design, juridique S6) : « Description
// écrite par Waiggle, sans lien avec l'éditeur de l'outil » ne dit quelque chose que s'il y a une
// description. Sans description, la phrase ne s'affiche pas (elle parlait d'un texte absent).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToolHeader } from './ToolHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const DISCLAIMER = fr.t(($) => $.tool.disclaimer)

type Props = Parameters<typeof ToolHeader>[0]
const props = (over: Partial<Props> = {}): Props => ({
  name: 'Claude Code',
  projects: fr.t(($) => $.tools.projects, { count: 3 }),
  family: fr.t(($) => $.tools.family.assistant),
  description: 'Un assistant qui écrit du code dans le terminal.',
  disclaimer: DISCLAIMER,
  site: null,
  layout: 'phone',
  ...over,
})

describe('ToolHeader, who wrote the description', () => {
  it('says who wrote the description when there is one', async () => {
    await renderWithProviders(<ToolHeader {...props()} />)

    expect(screen.getByText(DISCLAIMER)).toBeTruthy()
  })

  it('says nothing about a description that does not exist', async () => {
    await renderWithProviders(<ToolHeader {...props({ description: null })} />)

    expect(screen.getByRole('header', { name: 'Claude Code' })).toBeTruthy() // témoin
    expect(screen.queryByText(DISCLAIMER)).toBeNull()
  })
})
