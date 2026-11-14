// Tests d'une partie retirée par la modération, vue par son auteur (R9, 7d, planche
// `R9-Partie-Retiree`, décision L2 de Louis du 13/11/2026) : la 2e photo de « Météo » est retirée ;
// Inès la voit encore, avec « Retiré par la modération », le fondement, l'explication, la date,
// « Pour contester » et l'adresse de contact écrite en clair (un lien), la possibilité de saisir la
// justice, puis « Remplacer » et « Supprimer » (article 17 du règlement européen sur les services
// numériques : l'auteur sait quoi, pourquoi, et comment contester).
//
// L'API attendue de `ui/RemovedPart` (plan de R9, relecture juridique jur-P2) :
//   { title: string; removal: Removal; contestSubject: string;
//     onReplace: (() => void) | null; onDelete: (() => void) | null; children: ReactNode }
//   rôle `group` nommé par `title` ; `null` = bouton absent ; le focus va au titre après
//   « Supprimer ».
import { contactEmail } from '@ruche/brand'
import type { Removal } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Linking, Platform, View } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from './focus'
import { RemovedPart } from './RemovedPart'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le focus posé par le composant passe par les outils de `ui/focus` : on les écoute, sans rien
// changer à ce qu'ils font.
jest.mock('./focus', () => {
  const actual = jest.requireActual('./focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

const TITLE = fr.t(($) => $.removal.part.titles.photo, { n: 2 })
const SUBJECT = fr.t(($) => $.removal.contestSubject, {
  decision: fr.t(($) => $.removal.contestDecision.part, { part: 'la photo 2', title: 'Météo' }),
  date: '12 nov.',
})
const PHOTO = 'La photo du balcon'

const removal: Removal = {
  ground: 'illegal',
  explanation: 'Cette photo montre une personne reconnaissable sur son balcon, sans son accord.',
  // Midi en heure de Paris : le même jour quel que soit le fuseau des tests.
  at: '2026-11-12T11:00:00.000Z',
  afterReport: true,
}

const onReplace = jest.fn()
const onDelete = jest.fn()
let openURL: jest.SpyInstance

beforeEach(() => {
  onReplace.mockClear()
  onDelete.mockClear()
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})
afterEach(() => openURL.mockRestore())

const show = (
  props: Partial<{
    removal: Removal
    onReplace: (() => void) | null
    onDelete: (() => void) | null
  }> = {},
) =>
  renderWithProviders(
    <RemovedPart
      title={TITLE}
      removal={props.removal ?? removal}
      contestSubject={SUBJECT}
      onReplace={props.onReplace === undefined ? onReplace : props.onReplace}
      onDelete={props.onDelete === undefined ? onDelete : props.onDelete}
    >
      <View accessibilityLabel={PHOTO}>
        <Text>{PHOTO}</Text>
      </View>
    </RemovedPart>,
  )

/**
 * La notice entière : le groupe nommé par son titre. Cherché par son nom, puis son rôle vérifié
 * (comme CategoryPicker) : `getByRole` exigerait une vue `accessible`, qui sur iOS cacherait à
 * VoiceOver les boutons et le lien qu'elle contient (R9, piège de design.md).
 */
const group = () => {
  const found = screen.getByLabelText(TITLE)
  expect(found.props.role ?? found.props.accessibilityRole).toBe('group')
  return found
}
/** Vrai si ce texte est écrit dans la notice, blancs de la typographie française compris. */
const inGroup = (text: string) => within(group()).queryAllByText(containing(text)).length > 0

/** Le lien de la notice qui ouvre la messagerie, quel que soit son texte. */
const contactLinks = () =>
  within(group())
    .queryAllByRole('link')
    .filter((link) => {
      const name = String(link.props.accessibilityLabel ?? '')
      return name === contactEmail || name === fr.t(($) => $.notifications.contest)
    })

/** Le texte des vues qui ont reçu le focus par les outils de `ui/focus`, dans l'ordre. */
const focused = (): string[] =>
  [focusWithoutScroll, focusAndReveal, moveReaderTo]
    .flatMap((fn) => {
      const { calls, invocationCallOrder } = jest.mocked(fn).mock
      return calls.map(([node], index) => ({ node, order: invocationCallOrder[index] ?? 0 }))
    })
    .sort((a, b) => a.order - b.order)
    .map(({ node }) => labelOf(node) ?? '')

describe('RemovedPart', () => {
  it('is a group named by its title, around the part itself', async () => {
    await show()

    expect(group()).toBeTruthy()
    expect(within(group()).getByText(PHOTO)).toBeTruthy()
  })

  it('shows the ground, the explanation, the date and Contester on a removed part', async () => {
    await show()

    expect(inGroup(fr.t(($) => $.removal.grounds.illegal))).toBe(true)
    expect(inGroup(fr.t(($) => $.removal.explanation, { explanation: removal.explanation }))).toBe(
      true,
    )
    // La date absolue, jamais « il y a 2 jours » : la notice se relit longtemps après.
    const dated = within(group()).queryAllByText(/Retiré le .*12 nov/)
    expect(dated.length).toBeGreaterThan(0)
    expect(inGroup(fr.t(($) => $.removal.part.contestLead))).toBe(true)
    expect(contactLinks().length).toBeGreaterThan(0)
  })

  it('writes the contact address in full next to Contester', async () => {
    await show()

    // L'adresse se lit et se recopie, même sans appli de messagerie.
    expect(inGroup(contactEmail)).toBe(true)
  })

  it('shows the ground and a contact link in a removed part', async () => {
    await show({ removal: { ...removal, ground: 'rules' } })

    expect(inGroup(fr.t(($) => $.removal.grounds.rules))).toBe(true)
    expect(inGroup(fr.t(($) => $.removal.grounds.illegal))).toBe(false)
    expect(contactLinks().length).toBeGreaterThan(0)
  })

  it('opens the contact address with the subject of the decision from Contester', async () => {
    await show()

    const [link] = contactLinks()
    if (!link) throw new Error('no contact link')
    await fireEvent.press(link)

    const url = String(openURL.mock.calls.at(-1)?.[0] ?? '')
    expect(url.startsWith(`mailto:${contactEmail}?subject=`)).toBe(true)
    expect(decodeURIComponent(url.split('?subject=')[1] ?? '')).toBe(SUBJECT)
  })

  it('says the member may also go to court', async () => {
    await show()

    expect(inGroup(fr.t(($) => $.removal.part.court))).toBe(true)
  })

  it('says only the author still sees the part', async () => {
    await show()

    expect(inGroup(fr.t(($) => $.removal.part.onlyYou))).toBe(true)
  })

  it('says whether a report came first, never by whom', async () => {
    await show()
    expect(inGroup(fr.t(($) => $.removal.afterReport))).toBe(true)
    expect(inGroup(fr.t(($) => $.removal.direct))).toBe(false)
  })

  it('says a person decided without a report', async () => {
    await show({ removal: { ...removal, afterReport: false } })

    expect(inGroup(fr.t(($) => $.removal.direct))).toBe(true)
    expect(inGroup(fr.t(($) => $.removal.afterReport))).toBe(false)
  })

  it('offers « Remplacer » and « Supprimer », each calling its own action', async () => {
    await show()

    await fireEvent.press(within(group()).getByRole('button', { name: 'Remplacer' }))
    expect(onReplace).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
    await fireEvent.press(within(group()).getByRole('button', { name: 'Supprimer' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('leaves a button out when its action is null', async () => {
    await show({ onReplace: null })

    // Témoin : « Supprimer » reste.
    expect(within(group()).getByRole('button', { name: 'Supprimer' })).toBeTruthy()
    expect(within(group()).queryByRole('button', { name: 'Remplacer' })).toBeNull()
  })

  it('offers no button at all when both actions are null, and still says how to contest', async () => {
    await show({ onReplace: null, onDelete: null })

    expect(within(group()).queryByRole('button')).toBeNull()
    expect(contactLinks().length).toBeGreaterThan(0)
  })

  it('moves the focus to its title after « Supprimer »', async () => {
    await show()

    await fireEvent.press(within(group()).getByRole('button', { name: 'Supprimer' }))

    expect(focused().at(-1)).toContain(TITLE)
  })

  it('says « Pour contester » once, not once from the notice and once from a sentence', async () => {
    await show()

    // Le fil « Pour contester : » est écrit une fois dans l'encadré, avec une seule adresse.
    const lead = fr.t(($) => $.removal.part.contestLead)
    expect(within(group()).queryAllByText(containing(lead))).toHaveLength(1)
    expect(within(group()).queryAllByText(containing(contactEmail))).toHaveLength(1)
  })

  it('shows Delete as loading while the photo is being deleted', async () => {
    await renderWithProviders(
      <RemovedPart
        title={TITLE}
        removal={removal}
        contestSubject={SUBJECT}
        onReplace={onReplace}
        onDelete={onDelete}
        deleting
      />,
    )

    const busy = (button: { props: Record<string, unknown> }) =>
      button.props['aria-busy'] === true ||
      (button.props.accessibilityState as { busy?: boolean } | undefined)?.busy === true
    const remove = within(group()).getByRole('button', { name: 'Supprimer' })
    expect(busy(remove)).toBe(true)
    await fireEvent.press(remove)
    expect(onDelete).not.toHaveBeenCalled()
    expect(within(group()).getByRole('button', { name: 'Remplacer' })).toBeDisabled()
  })

  it('does not show Delete as loading by default (witness)', async () => {
    await show()

    const remove = within(group()).getByRole('button', { name: 'Supprimer' })
    expect(remove.props['aria-busy']).not.toBe(true)
    expect(within(group()).getByRole('button', { name: 'Remplacer' })).not.toBeDisabled()
  })

  describe('with two removed parts in a page', () => {
    // Deux « Supprimer » de même nom : chacun se lit avec le titre de sa partie.
    it('reads the title of the removed part after Delete and Replace on a phone', async () => {
      await show()

      for (const name of ['Supprimer', 'Remplacer']) {
        expect(within(group()).getByRole('button', { name }).props.accessibilityHint).toBe(TITLE)
      }
    })

    it('points Delete and Replace to the title with aria-describedby on the web', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await show()

        const titleId = within(group()).getByText(TITLE).props.nativeID
        expect(titleId).toBeTruthy()
        for (const name of ['Supprimer', 'Remplacer']) {
          expect(within(group()).getByRole('button', { name }).props['aria-describedby']).toBe(
            titleId,
          )
        }
      } finally {
        jest.restoreAllMocks()
      }
    })
  })
})
