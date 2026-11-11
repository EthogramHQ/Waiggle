// Tests de la case à cocher (refonte, tranche R1) : elle se coche au doigt, sur son libellé comme
// sur la case, à la barre d'espace sur le web, et annonce son état aux lecteurs d'écran.
// Son API reprend celle de l'interrupteur (Switch) : `value` et `onValueChange`.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Checkbox } from './Checkbox'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const press = (key: string) => ({ key, repeat: false, preventDefault: () => {} })

const label = 'J’accepte les règles de la ruche'

/** Une case qui garde son état, comme dans un vrai formulaire. */
const Sample = ({ start = false, disabled = false }: { start?: boolean; disabled?: boolean }) => {
  const [value, setValue] = useState(start)
  return <Checkbox label={label} value={value} onValueChange={setValue} disabled={disabled} />
}

describe('Checkbox', () => {
  it('is a checkbox named by its label, unchecked at first', async () => {
    await renderWithProviders(<Sample />)

    expect(screen.getByRole('checkbox', { name: label, checked: false })).toBeTruthy()
  })

  it('announces that it is checked', async () => {
    await renderWithProviders(<Sample start />)

    expect(screen.getByRole('checkbox', { name: label, checked: true })).toBeTruthy()
  })

  it('toggles when touched, and back again', async () => {
    await renderWithProviders(<Sample />)

    await fireEvent.press(screen.getByRole('checkbox', { name: label }))
    expect(screen.getByRole('checkbox', { name: label, checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('checkbox', { name: label }))
    expect(screen.getByRole('checkbox', { name: label, checked: false })).toBeTruthy()
  })

  it('gives the new state to the screen that uses it', async () => {
    const onValueChange = jest.fn()
    await renderWithProviders(<Checkbox label={label} value onValueChange={onValueChange} />)

    await fireEvent.press(screen.getByRole('checkbox', { name: label }))

    expect(onValueChange).toHaveBeenCalledWith(false)
  })

  it('toggles when its label is touched, not only the small box', async () => {
    // La case fait 24 points : le libellé fait partie de la zone à toucher.
    await renderWithProviders(<Sample />)

    await fireEvent.press(screen.getByText(label))

    expect(screen.getByRole('checkbox', { name: label, checked: true })).toBeTruthy()
  })

  it('does nothing while disabled, and says so', async () => {
    const onValueChange = jest.fn()
    await renderWithProviders(
      <Checkbox label={label} value={false} onValueChange={onValueChange} disabled />,
    )

    const box = screen.getByRole('checkbox', { name: label })
    expect(box).toBeDisabled()
    await fireEvent.press(box)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('shows its error message', async () => {
    await renderWithProviders(
      <Checkbox
        label={label}
        value={false}
        onValueChange={() => {}}
        error="Coche cette case pour continuer."
      />,
    )

    expect(screen.getByRole('checkbox', { name: label })).toBeTruthy() // témoin
    expect(screen.getByText('Coche cette case pour continuer.')).toBeTruthy()
  })

  // R7b (relecture du plan ui-B3) : dans « Retours réglés » de la feuille « Nouvelle mise à jour »,
  // chaque case dit « Inès Morel · En partie », et une ligne dessous rappelle le retour
  // (« « Le niveau 3 plante », 2 nov. »). Le nom de la case reste son libellé ; la ligne du dessous
  // est sa description, lue après le nom : `aria-describedby` sur le web, l'indice sur téléphone.
  describe('with a detail line (R7b)', () => {
    const item = 'Inès Morel · En partie'
    const detail = fr.t(($) => $.project.testers.settledField.detail, {
      excerpt: 'Le niveau 3 plante',
      date: '2 nov.',
    })

    it('describes a checkbox by its detail without hiding its label', async () => {
      await renderWithProviders(
        <Checkbox label={item} detail={detail} value={false} onValueChange={() => {}} />,
      )

      // Le nom reste le libellé seul, mot pour mot, et les deux textes restent affichés.
      const box = screen.getByRole('checkbox', { name: item, checked: false })
      expect(box.props.accessibilityLabel).toBe(item)
      expect(screen.getByText(item)).toBeTruthy()
      expect(screen.getByText(detail)).toBeTruthy()
      // Sur téléphone, la description est l'indice de la case.
      expect(box.props.accessibilityHint).toBe(detail)
    })

    it('points to its detail with aria-describedby on the web', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(
          <Checkbox label={item} detail={detail} value onValueChange={() => {}} />,
        )

        const box = screen.getByRole('checkbox', { name: item, checked: true })
        const described = String(box.props['aria-describedby'] ?? '')
        const line = screen.getByText(detail)
        const lineId = line.props.nativeID ?? line.props.id
        expect(lineId).toBeTruthy()
        expect(described.split(' ')).toContain(lineId)
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('still toggles when its detail line is touched', async () => {
      // Toute la ligne est la zone à toucher (en tête du composant) : le détail en fait partie.
      const onValueChange = jest.fn()
      await renderWithProviders(
        <Checkbox label={item} detail={detail} value={false} onValueChange={onValueChange} />,
      )

      await fireEvent.press(screen.getByText(detail))

      expect(onValueChange).toHaveBeenCalledWith(true)
    })

    it('has no description without a detail (témoin)', async () => {
      await renderWithProviders(<Sample />)

      expect(screen.getByRole('checkbox', { name: label }).props.accessibilityHint).toBeUndefined()
    })
  })

  describe('on the web, with the keyboard', () => {
    it('toggles with the space bar', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(<Sample />)

        await fireEvent(screen.getByRole('checkbox', { name: label }), 'keyDown', press(' '))

        expect(screen.getByRole('checkbox', { name: label, checked: true })).toBeTruthy()
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('ignores the space bar while disabled', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        const onValueChange = jest.fn()
        await renderWithProviders(
          <Checkbox label={label} value={false} onValueChange={onValueChange} disabled />,
        )

        await fireEvent(screen.getByRole('checkbox', { name: label }), 'keyDown', press(' '))

        expect(onValueChange).not.toHaveBeenCalled()
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('is marked invalid when it shows an error', async () => {
      // Sur le web, le lecteur d'écran dit « saisie invalide » en arrivant sur la case.
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(
          <Checkbox label={label} value={false} onValueChange={() => {}} error="Coche-la." />,
        )

        expect(screen.getByRole('checkbox', { name: label })).toHaveProp('aria-invalid', true)
      } finally {
        jest.restoreAllMocks()
      }
    })
  })
})
