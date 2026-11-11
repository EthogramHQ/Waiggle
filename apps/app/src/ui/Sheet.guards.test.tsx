// Tests de la garde contre la double tape sur les boutons de la feuille (R7a, relecture du plan,
// interface B1 et B3). Depuis R2, la feuille ignore les tapes sur son voile pendant TAP_GUARD_MS
// après l'ouverture : elle s'ouvre souvent sous le doigt qui vient de toucher « Rejoindre les testeurs »
// ou « Publier une mise à jour ». Mais ses boutons, eux, répondaient tout de suite : la seconde tape
// d'une double tape tombait sur la confirmation (au pied sur téléphone, au centre sur ordinateur ;
// « Quitter les testeurs » jusqu'à R7b) ou sur « Publier », et faisait une action que personne n'avait choisie.
//
// La règle (« API fixées au lancement », corrigée le 10/11) : avec `guardTaps` (faux par défaut),
// l'action, « Annuler » et les boutons du pied ignorent toute tape pendant TAP_GUARD_MS (600 ms)
// après l'ouverture, comme le voile. Une tape vers 700 ms est un geste à part, qui passe. Sans
// `guardTaps`, rien ne change : une garde sans condition aurait changé toutes les autres feuilles.
// Ces tests lisent seulement ce qui est appelé, jamais comment la garde est posée (bouton inactif ou
// couche qui ne reçoit pas les tapes).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Avancer la fausse horloge de `ms` millisecondes, dans un `act` (les minuteurs changent l'état). */
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms))

/**
 * La feuille de publication : « Annuler », un titre, « Publier », et un bouton au pied. Gardée par
 * défaut (`guardTaps`), comme la posera « Nouvelle mise à jour » ; `guarded={false}` pour le témoin.
 */
function GuardedSheet({
  open = true,
  guarded = true,
  onAction,
  onCancel,
  onFooter,
}: {
  open?: boolean
  guarded?: boolean
  onAction: jest.Mock
  onCancel: jest.Mock
  onFooter?: jest.Mock
}) {
  return (
    <Sheet
      open={open}
      guardTaps={guarded}
      title="Nouvelle mise à jour"
      onClose={jest.fn()}
      closeGuard={onCancel}
      cancelLabel="Annuler"
      action={{ label: 'Publier', onPress: onAction }}
      {...(onFooter
        ? { footer: <Button label="Enregistrer le brouillon" onPress={onFooter} /> }
        : null)}
    >
      <Text>Ce qui a changé</Text>
    </Sheet>
  )
}

// R7b : la feuille « Tu testes ce projet » est partie (on quitte depuis le coin ou le menu « … »).
// Le même risque demeure sur la feuille d'inscription : son bouton « Rejoindre les testeurs »
// s'ouvre sous le doigt qui vient de toucher le bouton du même nom, sur la page.
const join = fr.t(($) => $.project.testers.join)
const confirm = fr.t(($) => $.project.testers.confirm)

/**
 * La page d'un projet qui cherche des testeurs, réduite à ce qui compte ici (interface B3) :
 * « Rejoindre les testeurs » ouvre la feuille dont le pied porte la confirmation du même nom.
 */
function JoinPage({ onJoin }: { onJoin: jest.Mock }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button label={join} onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        guardTaps
        title={fr.t(($) => $.project.testers.joinTitle)}
        onClose={() => setOpen(false)}
        footer={<Button label={confirm} onPress={onJoin} />}
      >
        <Text>
          {fr.t(($) => $.project.testers.joinBody, { name: 'Léa', title: 'Quiz de Léa' })}
        </Text>
      </Sheet>
    </>
  )
}

describe('the buttons of a sheet, against a double tap (R7a)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('ignores a tap on its action right after opening', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<GuardedSheet onAction={onPress} onCancel={jest.fn()} />)

    await wait(100)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
    expect(onPress).not.toHaveBeenCalled()

    await wait(600)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // Témoin : sans `guardTaps`, les autres feuilles de l'appli ne changent pas.
  it('takes a tap on its action right after opening without guardTaps', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <GuardedSheet guarded={false} onAction={onPress} onCancel={jest.fn()} />,
    )

    await wait(100)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('ignores a tap on « Annuler » right after opening, then asks to close', async () => {
    const onCancel = jest.fn()
    await renderWithProviders(<GuardedSheet onAction={jest.fn()} onCancel={onCancel} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    await wait(TAP_GUARD_MS - 50)
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).not.toHaveBeenCalled()

    await wait(50)
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ignores a tap on a button of its footer right after opening', async () => {
    const onFooter = jest.fn()
    await renderWithProviders(
      <GuardedSheet onAction={jest.fn()} onCancel={jest.fn()} onFooter={onFooter} />,
    )

    await wait(180)
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(onFooter).not.toHaveBeenCalled()

    await wait(TAP_GUARD_MS)
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(onFooter).toHaveBeenCalledTimes(1)
  })

  it('guards its action and « Annuler » in the footer of a computer too', async () => {
    const restorePhone = setDesktopWindow()
    try {
      const onAction = jest.fn()
      const onCancel = jest.fn()
      await renderWithProviders(<GuardedSheet onAction={onAction} onCancel={onCancel} />)

      await wait(150)
      await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
      await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
      expect(onAction).not.toHaveBeenCalled()
      expect(onCancel).not.toHaveBeenCalled()

      await wait(TAP_GUARD_MS)
      await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
      await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
      expect(onAction).toHaveBeenCalledTimes(1)
      expect(onCancel).toHaveBeenCalledTimes(1)
    } finally {
      restorePhone()
    }
  })

  it('guards its buttons again each time it opens', async () => {
    const onAction = jest.fn()
    const onCancel = jest.fn()
    const sheet = (open: boolean) => (
      <GuardedSheet open={open} onAction={onAction} onCancel={onCancel} />
    )
    await renderWithProviders(sheet(true))
    await wait(TAP_GUARD_MS)

    await screen.rerender(sheet(false))
    await screen.rerender(sheet(true))
    await wait(100)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))

    expect(onAction).not.toHaveBeenCalled()
  })

  // Interface B3 : la seconde tape d'une double tape sur « Rejoindre les testeurs » tombe sur la
  // confirmation de la feuille qui vient de s'ouvrir. Elle ne doit rien faire.
  it('does not join on the second tap of a double tap on « Rejoindre les testeurs »', async () => {
    const onJoin = jest.fn()
    await renderWithProviders(<JoinPage onJoin={onJoin} />)

    const pageButton = screen.getByRole('button', { name: join })
    await fireEvent.press(pageButton)
    await wait(180)
    const inSheet = () => {
      const found = screen.getAllByRole('button', { name: confirm }).find((b) => b !== pageButton)
      if (!found) throw new Error('The sheet has no confirmation')
      return found
    }
    await screen.findByRole('header', { name: fr.t(($) => $.project.testers.joinTitle) })
    await fireEvent.press(inSheet())
    expect(onJoin).not.toHaveBeenCalled()

    // Témoin : un vrai geste, plus tard, inscrit bien.
    await wait(TAP_GUARD_MS)
    await fireEvent.press(inSheet())
    expect(onJoin).toHaveBeenCalledTimes(1)
  })
})
