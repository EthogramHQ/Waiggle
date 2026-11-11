// Tests de la pastille d'issue d'un retour (R7b, le coin des testeurs ; planche validée 6, relecture
// du plan ui-B3) : sous un retour d'un testeur, « Ça a marché ? » se dit d'une pastille, une icône et
// un mot. Oui : une coche ; En partie : un demi-cercle ; Non : une croix. Les couleurs (vert, ambre,
// rouge) viennent des rôles `outcome<Yes|Partly|No><Surface|Icon|Text>` de `packages/brand`, testés
// par leurs couples de contraste : ici, on ne lit que ce qui se lit et ce qui se dessine.
//
// Seule, la pastille dirait « En partie » sans dire à quoi : le parent lui donne une phrase à lire,
// `spokenLabel` (« Ça a marché : En partie »), lue à la place du mot affiché.
//
// L'API (plan R7b, « API fixée à l'assemblage ») :
// `OutcomePill({ outcome: FeedbackOutcome; label: string; spokenLabel?: string })`, lue
// `spokenLabel ?? label`.
import type { FeedbackOutcome } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { iconPaths } from './icons.generated'
import { OutcomePill } from './OutcomePill'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

const outcomes: FeedbackOutcome[] = ['yes', 'partly', 'no']
/** L'icône de chaque issue (planche validée 6). */
const iconOf = { yes: 'check', partly: 'circle-half', no: 'x' } as const
/** Le mot affiché de chaque issue, tiré des textes de l'appli. */
const wordOf = (outcome: FeedbackOutcome) =>
  fr.t(($) => $.project.testers.feedback.outcomes[outcome])
/** La phrase lue que le parent donne : « Ça a marché : En partie ». */
const spokenOf = (outcome: FeedbackOutcome) =>
  fr.t(($) => $.project.testers.feedback.outcomeSpoken, { outcome: wordOf(outcome) })

/** L'icône de cette issue est-elle dessinée ? On la reconnaît à son tracé, sans lire de style. */
const draws = (icon: keyof typeof iconPaths) =>
  all().some((node) => node.props.d === iconPaths[icon][0])

describe('OutcomePill', () => {
  it('reads the outcome as « Ça a marché : En partie »', async () => {
    await renderWithProviders(
      <OutcomePill outcome="partly" label={wordOf('partly')} spokenLabel={spokenOf('partly')} />,
    )

    // `\s` : le texte français a une espace insécable avant « : ».
    expect(spokenOf('partly')).toMatch(/^Ça a marché\s:\sEn partie$/)
    // Lue d'un seul tenant, par sa phrase ; le mot reste affiché.
    expect(screen.getByLabelText(spokenOf('partly'))).toBeTruthy()
    expect(screen.getByText('En partie')).toBeTruthy()
    // Le mot seul n'est pas un second nom lu à côté de la phrase.
    expect(screen.queryByLabelText('En partie')).toBeNull()
  })

  it.each(outcomes)('shows the word and the icon of the outcome (%s)', async (outcome) => {
    await renderWithProviders(<OutcomePill outcome={outcome} label={wordOf(outcome)} />)

    expect(screen.getByText(wordOf(outcome))).toBeTruthy()
    expect(draws(iconOf[outcome])).toBe(true)
    // Une seule icône : celles des deux autres issues ne sont pas dessinées.
    for (const other of outcomes.filter((each) => each !== outcome)) {
      expect(draws(iconOf[other])).toBe(false)
    }
  })

  it.each(outcomes)('is read by its word when no sentence is given (%s)', async (outcome) => {
    await renderWithProviders(<OutcomePill outcome={outcome} label={wordOf(outcome)} />)

    expect(screen.getByLabelText(wordOf(outcome))).toBeTruthy()
  })

  it('names the three outcomes Oui, En partie and Non (témoin des textes)', () => {
    expect(outcomes.map(wordOf)).toEqual(['Oui', 'En partie', 'Non'])
  })

  it('is not a control: nothing to touch in it', async () => {
    await renderWithProviders(
      <OutcomePill outcome="yes" label={wordOf('yes')} spokenLabel={spokenOf('yes')} />,
    )

    expect(screen.getByLabelText(spokenOf('yes'))).toBeTruthy() // témoin
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
