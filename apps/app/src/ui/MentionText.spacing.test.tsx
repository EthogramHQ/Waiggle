// Tests de la ponctuation dans un commentaire avec ses mentions (R18, scénario « Les textes des
// membres bien ponctués ») : l'espace tapée devant ? ! : ; devient insécable à l'affichage, sans
// casser la reconnaissance d'un « @pseudo » qui la précède : « @ines_morel : regarde » garde sa
// pastille « @Inès Morel », suivie d'une espace insécable et des deux-points.
//
// Les requêtes de RNTL ramènent toutes les espaces (insécables comprises) à une espace ordinaire :
// on lit donc le texte brut de l'arbre rendu.
import { fireEvent, screen } from '@testing-library/react-native'
import { inesMention } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MentionText } from './MentionText'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** L'espace fine insécable (U+202F), devant ? ! ; */
const NNBSP = String.fromCodePoint(0x202f)
/** L'espace insécable (U+00A0), devant : */
const NBSP = String.fromCodePoint(0x00a0)

/** Le nom lu d'une pastille (`mentions.pill`). */
const pill = (name: string) => fr.t(($) => $.mentions.pill, { name })

/** Tout le texte affiché, sans rien ramener : les chaînes de l'arbre, dans l'ordre. */
type Rendered = string | { children?: Rendered[] | null } | Rendered[] | null
const rawText = (node: Rendered): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(rawText).join('')
  return (node.children ?? []).map(rawText).join('')
}
const shown = () => rawText(screen.toJSON() as Rendered)

describe('MentionText, the punctuation of a member', () => {
  it('keeps a mention followed by a colon as a pill', async () => {
    const onMemberPress = jest.fn()
    await renderWithProviders(
      <MentionText
        text="@ines_morel : regarde ça ! Tu en penses quoi ?"
        mentions={[inesMention]}
        onMemberPress={onMemberPress}
      />,
    )

    // La pastille est toujours là, et mène toujours au membre…
    const link = screen.getByRole('link', { name: pill('Inès Morel') })
    await fireEvent.press(link)
    expect(onMemberPress).toHaveBeenCalledWith(inesMention.memberId)
    // … le pseudo écrit n'apparaît pas en texte simple…
    expect(shown()).not.toContain('@ines_morel')
    // … et l'espace tapée devant les deux-points, puis devant ! et ?, est insécable.
    expect(shown()).toContain(`${NBSP}: regarde ça${NNBSP}!`)
    expect(shown()).toContain(`quoi${NNBSP}?`)
  })

  it('keeps the typed space before ? non-breaking in a text without mention', async () => {
    await renderWithProviders(
      <MentionText text="Ça marche ? Oui!" mentions={[]} onMemberPress={jest.fn()} />,
    )

    expect(shown()).toContain(`Ça marche${NNBSP}? Oui!`)
  })
})
