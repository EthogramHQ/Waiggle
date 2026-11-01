// Ménage R4 (M2) : dans l'inscription, l'aide du code d'invitation est rangée comme celle du nom,
// dans le cadre d'un groupe de champs. La position exacte se mesure dans le navigateur (bords
// gauches égaux) ; ici, on vérifie ce qui la décide : les deux aides sont à la même profondeur
// de l'arbre, c'est-à-dire dans le même genre de cadre.
import { screen } from '@testing-library/react-native'
import { renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import { SignUpForm } from './SignUpForm'

jest.mock('../accounts/api', () => ({ signUp: jest.fn() }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

type Node = { parent: Node | null }

/** Le nombre d'étages entre un texte et la racine de l'arbre. */
const depthOf = (node: Node) => {
  let depth = 0
  for (let current = node.parent; current; current = current.parent) depth += 1
  return depth
}

describe('the sign-up hints (M2)', () => {
  it('puts the invitation code hint in a group, at the same depth as the name hint', async () => {
    await renderWithI18n(
      <SignUpForm draft={{ inviteCode: '', name: '', email: '' }} onDraft={jest.fn()} />,
    )

    const codeHint = screen.getByText(fr.t(($) => $.auth.fields.inviteCodeHint))
    const nameHint = screen.getByText(fr.t(($) => $.auth.fields.nameHint))

    expect(depthOf(nameHint)).toBeGreaterThan(0) // témoin : l'aide du nom est bien rendue
    expect(depthOf(codeHint)).toBe(depthOf(nameHint))
  })
})
