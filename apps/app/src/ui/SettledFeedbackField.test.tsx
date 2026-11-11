// Tests de la partie « Retours réglés » de la feuille « Nouvelle mise à jour » (R7b, décision 4 du
// plan ; planche validée 12, relecture du plan juridique J9, ui-B3). L'auteur coche les retours que
// sa mise à jour règle : ils passent dans « Réglés », et les testeurs actuels le lisent sous leur
// retour. La partie montre :
// - son titre, le compteur (« 2 sur 3 ») et l'aide (qui lira quoi, J9) ;
// - une case par retour, nommée « Inès Morel · En partie » et décrite par l'extrait et la date ;
//   « Ne teste plus » dans la description d'un ancien testeur ;
// - au plus `max` cases cochées : à la limite, les cases restantes sont inactives et une phrase le
//   dit (les cases cochées restent touchables, pour décocher).
//
// L'API (plan R7b, « Briques du fil et du coin, API fixée ») :
// `SettledFeedbackField({ items: { id: string, label: string, detail: string | null,
//   former: boolean }[], value: string[], onChange: (ids: string[]) => void, max: number,
//   editable?: boolean })`. `detail` arrive écrit par l'écran (`settledField.detail`).
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps, ReactElement } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SettledFeedbackField } from './SettledFeedbackField'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const text = {
  title: fr.t(($) => $.project.testers.settledField.title),
  count: (count: number, total: number) =>
    fr.t(($) => $.project.testers.settledField.count, { count, total }),
  hint: fr.t(($) => $.project.testers.settledField.hint),
  item: (name: string, outcome: string) =>
    fr.t(($) => $.project.testers.settledField.item, { name, outcome }),
  detail: (excerpt: string, date: string) =>
    fr.t(($) => $.project.testers.settledField.detail, { excerpt, date }),
  detailNoText: (date: string) =>
    fr.t(($) => $.project.testers.settledField.detailNoText, { date }),
  max: (max: number) => fr.t(($) => $.project.testers.settledField.max, { max }),
  former: fr.t(($) => $.project.testers.settledField.former),
}

const items = [
  {
    id: 'f1',
    label: text.item('Inès Morel', 'En partie'),
    detail: text.detail('Le score repart à zéro au niveau 3', '2 nov.'),
    former: false,
  },
  {
    id: 'f2',
    label: text.item('Sam Petit', 'Non'),
    detail: text.detail('Rien ne s’affiche sur tablette', '4 nov.'),
    former: false,
  },
  {
    id: 'f3',
    label: text.item('Hugo Lefèvre', 'Oui'),
    detail: text.detailNoText('5 nov.'),
    former: true,
  },
]
const [ines, sam, hugo] = items as [(typeof items)[0], (typeof items)[0], (typeof items)[0]]

type FieldProps = ComponentProps<typeof SettledFeedbackField>

const field = (props: Partial<FieldProps> = {}): ReactElement => (
  <SettledFeedbackField items={items} value={[]} onChange={() => {}} max={20} {...props} />
)

// --- Les outils ----------------------------------------------------------------------------------

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)
const textOf = (node: Host): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')

/** Les blancs ramenés à une espace (les espaces insécables du français comprises). */
const flat = (value: string) => value.replace(/\s+/g, ' ')

/** Ce qui décrit une case : l'indice sur téléphone ; sur le web, les textes d'`aria-describedby`. */
const descriptionOf = (box: unknown): string => {
  const { props } = box as Host
  if (Platform.OS !== 'web') return flat(String(props.accessibilityHint ?? ''))
  const ids = String(props['aria-describedby'] ?? '')
    .split(' ')
    .filter(Boolean)
  return flat(
    ids
      .map((id) =>
        all()
          .filter((node) => node.props.nativeID === id || node.props.id === id)
          .map(textOf)
          .join(' '),
      )
      .join(' '),
  )
}

const box = (label: string) => screen.getByRole('checkbox', { name: label })

/** La case est-elle cochée ? Sur téléphone, RNTL lit `accessibilityState.checked`. */
const isChecked = (label: string) => {
  const { props } = box(label) as unknown as Host
  return (
    props['aria-checked'] === true ||
    (props.accessibilityState as { checked?: boolean } | undefined)?.checked === true
  )
}

// --- Les tests -----------------------------------------------------------------------------------

describe('SettledFeedbackField', () => {
  it('shows its title, its counter and its hint', async () => {
    await renderWithProviders(field({ value: ['f1', 'f2'] }))

    expect(screen.getByText(text.title)).toBeTruthy()
    expect(flat(text.count(2, 3))).toBe('2 sur 3')
    expect(screen.getByText(containing(text.count(2, 3)))).toBeTruthy()
    expect(screen.getByText(containing(text.hint))).toBeTruthy()
  })

  it('offers one checkbox per open feedback, named by the tester and the outcome', async () => {
    await renderWithProviders(field())

    expect(flat(ines.label)).toBe('Inès Morel · En partie')
    for (const item of items) expect(box(item.label)).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('describes each settled-feedback box by its excerpt and date', async () => {
    await renderWithProviders(field())

    expect(flat(ines.detail ?? '')).toBe('« Le score repart à zéro au niveau 3 », 2 nov.')
    for (const item of [ines, sam]) {
      expect(descriptionOf(box(item.label))).toContain(flat(item.detail ?? ''))
    }
    // Le détail se voit aussi sous le libellé.
    expect(screen.getByText(containing(ines.detail ?? ''))).toBeTruthy()
  })

  it('describes each box on the web too, through aria-describedby', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(field())

    for (const item of [ines, sam]) {
      expect(descriptionOf(box(item.label))).toContain(flat(item.detail ?? ''))
    }
  })

  it('says « Ne teste plus » in the description of a former tester, and only there', async () => {
    await renderWithProviders(field())

    const former = descriptionOf(box(hugo.label))
    expect(former).toContain(flat(hugo.detail ?? ''))
    expect(former).toContain(text.former)
    expect(descriptionOf(box(ines.label))).not.toContain(text.former)
  })

  it('shows which boxes are checked', async () => {
    await renderWithProviders(field({ value: ['f2'] }))

    expect(isChecked(sam.label)).toBe(true)
    expect(isChecked(ines.label)).toBe(false)
  })

  it('adds a feedback when its box is checked, and removes it when unchecked', async () => {
    const onChange = jest.fn()
    await renderWithProviders(field({ value: ['f2'], onChange }))

    await fireEvent.press(box(ines.label))
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining(['f1', 'f2']))
    expect(onChange.mock.lastCall?.[0]).toHaveLength(2)

    await fireEvent.press(box(sam.label))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('disables the unchecked boxes and says why once the maximum is reached', async () => {
    await renderWithProviders(field({ value: ['f1', 'f2'], max: 2 }))

    expect(box(hugo.label)).toBeDisabled()
    expect(screen.getByText(containing(text.max(2)))).toBeTruthy()
    // Les cases cochées restent touchables : on peut toujours décocher.
    expect(box(ines.label)).not.toBeDisabled()
    expect(box(sam.label)).not.toBeDisabled()
  })

  it('keeps every box usable and says nothing below the maximum', async () => {
    await renderWithProviders(field({ value: ['f1'], max: 2 }))

    for (const item of items) expect(box(item.label)).not.toBeDisabled()
    expect(screen.queryByText(containing(text.max(2)))).toBeNull()
  })

  it('changes nothing when it is not editable', async () => {
    const onChange = jest.fn()
    await renderWithProviders(field({ value: ['f1'], onChange, editable: false }))

    for (const item of items) expect(box(item.label)).toBeDisabled()
    await fireEvent.press(box(sam.label))
    expect(onChange).not.toHaveBeenCalled()
  })
})
