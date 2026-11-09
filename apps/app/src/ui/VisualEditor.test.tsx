// Le focus de la couverture verticale (R6a, correction C1, ui-B1) : après « Retirer la couverture
// verticale », le bouton touché disparaît ; le focus du clavier (web) va au premier bouton qui
// reste (« Choisir une couverture verticale »), au lieu de retomber sur la page. Et pendant une
// écriture, les boutons attendent (`aria-busy`) sans devenir inactifs : sur le web, un bouton
// inactif sort du parcours au clavier.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders } from '../testing/render'
import { focusWithoutScroll } from './focus'
import { VisualEditor, type VisualEditorLabels } from './VisualEditor'

jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

const labels: VisualEditorLabels = {
  portrait: 'Couverture verticale, facultative',
  portraitHint: 'Sur téléphone.',
  choosePortrait: 'Choisir une couverture verticale',
  replacePortrait: 'Remplacer la couverture verticale',
  removePortrait: 'Retirer la couverture verticale',
}

const tile = {
  key: 'p',
  image: { source: { uri: 'https://exemple.test/p.jpg' }, label: 'Couverture' },
}

/** Comme l'écran : la couverture part de l'affichage au toucher de « Retirer ». */
const Page = ({ busy = false }: { busy?: boolean }) => {
  const [portrait, setPortrait] = useState<typeof tile | null>(tile)
  return (
    <VisualEditor
      labels={labels}
      portrait={portrait}
      onPickPortrait={() => {}}
      onRemovePortrait={() => setPortrait(null)}
      busy={busy}
    />
  )
}

describe('VisualEditor focus', () => {
  beforeEach(() => jest.mocked(focusWithoutScroll).mockClear())

  it('gives the focus to « Choisir une couverture verticale » once the cover is removed', async () => {
    await renderWithProviders(<Page />)

    await fireEvent.press(screen.getByRole('button', { name: labels.removePortrait }))

    const target = jest.mocked(focusWithoutScroll).mock.calls.at(-1)?.[0] as {
      props: Record<string, unknown>
    } | null
    expect(target).toBeTruthy()
    expect(target?.props['aria-label'] ?? target?.props.accessibilityLabel).toBe(
      labels.choosePortrait,
    )
    expect(screen.queryByRole('button', { name: labels.removePortrait })).toBeNull()
  })

  it('keeps both buttons reachable but waiting while it writes', async () => {
    await renderWithProviders(<Page busy />)

    expect(screen.getByRole('button', { name: labels.replacePortrait })).toBeBusy()
    expect(screen.getByRole('button', { name: labels.removePortrait })).toBeBusy()
  })
})
