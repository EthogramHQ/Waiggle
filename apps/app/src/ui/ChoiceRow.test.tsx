// Tests de la ligne de choix (R8, planche `R8-Reglages`) : une ligne par type d'e-mail dans l'écran
// « Notifications » des réglages. Fermée, c'est un bouton qui dit le type et son choix actuel
// (« Commentaires sur tes projets, Dans le récap ») ; touchée, elle s'ouvre sur place, un bouton
// radio par choix, sur le fond miel pâle (`highlightSoft`). Une seule ligne ouverte à la fois :
// c'est l'écran qui le décide (`open`, `onToggle`). Choisir ne ferme pas la ligne : le membre voit
// son choix pris, et le focus du clavier reste sur le bouton radio choisi.
//
// La note (« Le récap est coupé : rien ne part ») se lit après le nom : l'indice sur téléphone,
// `aria-describedby` sur le web.
import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ChoiceRow } from './ChoiceRow'
import { revealWithoutJump } from './focus'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le défilement vers l'erreur : on note l'appel, le navigateur fait le reste (contre-visite de R8).
jest.mock('./focus', () => ({ ...jest.requireActual('./focus'), revealWithoutJump: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

type Choice = 'now' | 'digest' | 'never'

const LABEL = fr.t(($) => $.notificationSettings.types.comments)
const NOW = fr.t(($) => $.notificationSettings.choices.now)
const DIGEST = fr.t(($) => $.notificationSettings.choices.digest)
const NEVER = fr.t(($) => $.notificationSettings.choices.never)
const NOTE = fr.t(($) => $.notificationSettings.recapOff)
/** Le nom lu de la ligne : son libellé, puis son choix actuel. */
const rowName = (choice: string) =>
  fr.t(($) => $.notificationSettings.rowName, { label: LABEL, choice })

const choices: { value: Choice; label: string }[] = [
  { value: 'now', label: NOW },
  { value: 'digest', label: DIGEST },
  { value: 'never', label: NEVER },
]

/** Une ligne gardée comme dans l'écran : ouverte ou non, et son choix ; chaque geste est noté. */
function Row({
  start = 'digest',
  startOpen = false,
  note = null,
  disabled = false,
  toggled = jest.fn(),
  changed = jest.fn(),
}: {
  start?: Choice
  startOpen?: boolean
  note?: string | null
  disabled?: boolean
  toggled?: jest.Mock
  changed?: jest.Mock
}) {
  const [open, setOpen] = useState(startOpen)
  const [value, setValue] = useState<Choice>(start)
  return (
    <ChoiceRow
      label={LABEL}
      value={value}
      choices={choices}
      open={open}
      onToggle={() => {
        toggled()
        setOpen((was) => !was)
      }}
      onChange={(next: Choice) => {
        changed(next)
        setValue(next)
      }}
      note={note}
      disabled={disabled}
    />
  )
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

type Node = { props: Record<string, unknown>; parent: Node | null }

/** Les fonds de `node` et de ses ancêtres, du plus proche au plus lointain. */
const backgroundsAbove = (node: Node) => {
  const found: unknown[] = []
  for (let at: Node | null = node; at; at = at.parent) {
    const style = StyleSheet.flatten(at.props.style as never) as {
      backgroundColor?: unknown
    } | null
    if (style?.backgroundColor !== undefined) found.push(style.backgroundColor)
  }
  return found
}

describe('ChoiceRow, closed', () => {
  it('names the row with its current choice and describes it with the note', async () => {
    await renderWithProviders(<Row note={NOTE} />)

    const row = screen.getByRole('button', { name: rowName(DIGEST), expanded: false })
    // Le libellé et le choix restent affichés, et la note dessous.
    expect(screen.getByText(LABEL)).toBeTruthy()
    expect(screen.getByText(DIGEST)).toBeTruthy()
    expect(screen.getByText(NOTE)).toBeTruthy()
    // Sur téléphone, la note est l'indice de la ligne, lu après son nom.
    expect(row.props.accessibilityHint).toBe(NOTE)
  })

  it('points to its note with aria-describedby on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<Row note={NOTE} />)

    const row = screen.getByRole('button', { name: rowName(DIGEST) })
    const line = screen.getByText(NOTE)
    const lineId = line.props.nativeID ?? line.props.id
    expect(lineId).toBeTruthy()
    expect(String(row.props['aria-describedby'] ?? '').split(' ')).toContain(lineId)
  })

  it('has no note and no hint without one', async () => {
    await renderWithProviders(<Row />)

    const row = screen.getByRole('button', { name: rowName(DIGEST) })
    expect(row.props.accessibilityHint ?? null).toBeNull()
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('shows no radio while closed', async () => {
    await renderWithProviders(<Row />)

    expect(screen.getByRole('button', { name: rowName(DIGEST) })).toBeTruthy() // témoin
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('asks the screen to open it when touched', async () => {
    const toggled = jest.fn()
    const changed = jest.fn()
    await renderWithProviders(<Row toggled={toggled} changed={changed} />)

    await fireEvent.press(screen.getByRole('button', { name: rowName(DIGEST) }))

    expect(toggled).toHaveBeenCalledTimes(1)
    expect(changed).not.toHaveBeenCalled()
  })

  it('cannot be opened while disabled, and says so', async () => {
    const toggled = jest.fn()
    await renderWithProviders(<Row disabled toggled={toggled} />)

    const row = screen.getByRole('button', { name: rowName(DIGEST) })
    expect(row).toBeDisabled()
    await fireEvent.press(row)
    expect(toggled).not.toHaveBeenCalled()
  })
})

describe('ChoiceRow, open', () => {
  it('says it is expanded and shows one radio per choice, the current one checked', async () => {
    await renderWithProviders(<Row startOpen />)

    expect(screen.getByRole('button', { name: rowName(DIGEST), expanded: true })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: DIGEST, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: NOW, checked: false })).toBeTruthy()
    expect(screen.getByRole('radio', { name: NEVER, checked: false })).toBeTruthy()
  })

  it('names the group of radios by the label, without writing the label a second time', async () => {
    await renderWithProviders(<Row startOpen />)

    // Le groupe est nommé par le libellé de la ligne (lu par le lecteur d'écran) ; le libellé n'est
    // écrit qu'une fois à l'écran, dans la ligne (`labelHidden` du groupe).
    expect(screen.getByLabelText(LABEL).props.accessibilityRole).toBe('radiogroup')
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })

  it('gives the chosen value to the screen and stays open', async () => {
    const toggled = jest.fn()
    const changed = jest.fn()
    await renderWithProviders(<Row startOpen toggled={toggled} changed={changed} />)

    await fireEvent.press(screen.getByRole('radio', { name: NOW }))

    expect(changed).toHaveBeenCalledWith('now')
    expect(toggled).not.toHaveBeenCalled()
    // Le nouveau choix se lit aussitôt dans le nom de la ligne, toujours ouverte.
    expect(screen.getByRole('button', { name: rowName(NOW), expanded: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: NOW, checked: true })).toBeTruthy()
  })

  it('closes when its row is touched again', async () => {
    await renderWithProviders(<Row startOpen />)

    await fireEvent.press(screen.getByRole('button', { name: rowName(DIGEST) }))

    expect(screen.getByRole('button', { name: rowName(DIGEST), expanded: false })).toBeTruthy()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('offers only the choices it is given', async () => {
    await renderWithProviders(
      <ChoiceRow
        label={fr.t(($) => $.notificationSettings.types.reactions)}
        value="digest"
        choices={[
          { value: 'digest', label: DIGEST },
          { value: 'never', label: NEVER },
        ]}
        open
        onToggle={() => {}}
        onChange={() => {}}
      />,
    )

    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByRole('radio', { name: NOW })).toBeNull()
  })

  it('draws a new notification and an open choice row on highlightSoft', async () => {
    // Ici, la moitié « ligne de choix » de la règle (relecture de l'interface) : ouverte, la ligne
    // et ses choix sont sur `highlightSoft`, jamais sur `honeySoft` (contraste des textes gris).
    await renderWithProviders(<Row startOpen />)

    const radio = screen.getByRole('radio', { name: NOW }) as unknown as Node
    const backgrounds = backgroundsAbove(radio)
    expect(backgrounds).toContain(palettes.day.highlightSoft)
    expect(backgrounds).not.toContain(palettes.day.honeySoft)
  })

  it('leaves a closed row without the honey background', async () => {
    await renderWithProviders(<Row />)

    const row = screen.getByRole('button', { name: rowName(DIGEST) }) as unknown as Node
    expect(backgroundsAbove(row)).not.toContain(palettes.day.highlightSoft)
  })

  it('says why the choice was not saved, in an alert under the choices', async () => {
    const message = fr.t(($) => $.notificationSettings.saveError)
    function Failed() {
      return (
        <ChoiceRow
          label={LABEL}
          value="digest"
          choices={choices}
          open
          onToggle={() => {}}
          onChange={() => {}}
          error={message}
        />
      )
    }
    await renderWithProviders(<Failed />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(message)
    // Sous les boutons radio, jamais au-dessus : ce qui précède ne bouge pas quand elle paraît.
    const all: unknown[] = []
    const walk = (node: { children: unknown[] }) => {
      all.push(node)
      for (const child of node.children) if (typeof child !== 'string') walk(child as typeof node)
    }
    walk(screen.root as unknown as { children: unknown[] })
    expect(all.indexOf(alert)).toBeGreaterThan(
      all.indexOf(screen.getByRole('radio', { name: NEVER })),
    )
  })

  it('shows no alert without an error', async () => {
    await renderWithProviders(<Row startOpen />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  // Contre-visite de design de R8 : sur la dernière ligne, ouverte en bas de l'écran, l'erreur
  // tombait sous le bord (852 à 881 px sur 844). Elle vient dans l'écran quand elle paraît.
  it('brings its error into view when it appears, and only then', async () => {
    const reveal = jest.mocked(revealWithoutJump)
    reveal.mockClear()
    const message = fr.t(($) => $.notificationSettings.saveError)
    function Failing() {
      const [error, setError] = useState<string | null>(null)
      return (
        <View>
          <ChoiceRow
            label={LABEL}
            value="digest"
            choices={choices}
            open
            onToggle={() => {}}
            onChange={() => setError(message)}
            error={error}
          />
        </View>
      )
    }
    await renderWithProviders(<Failing />)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    // Témoin : sans erreur, rien ne défile.
    expect(reveal).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('radio', { name: NEVER }))
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(reveal).toHaveBeenCalledTimes(1)
    // Le nœud passé est celui de l'alerte.
    expect(reveal.mock.calls[0]?.[0]).toBeTruthy()
  })
})

describe('ChoiceRow, on the web, with the keyboard', () => {
  /**
   * Rend la ligne ouverte, puis écoute `focus` sur le prototype des vues natives (une vue témoin le
   * donne) ; `focused()` rend le nom de chaque vue qui a reçu le focus depuis.
   */
  const renderWatched = async (changed: jest.Mock) => {
    const probe = createRef<View>()
    await renderWithProviders(
      <>
        <View ref={probe} />
        <Row startOpen changed={changed} />
      </>,
    )
    const proto = Object.getPrototypeOf(probe.current) as { focus?: unknown }
    const hadFocus = Object.hasOwn(proto, 'focus')
    const original = proto.focus
    if (typeof proto.focus !== 'function') proto.focus = () => {}
    const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
    focus.mockClear()
    return {
      focused: () => focus.mock.contexts.map(labelOf),
      restore: () => {
        focus.mockRestore()
        if (hadFocus) proto.focus = original
        else delete proto.focus
      },
    }
  }

  it('stays open with the focus on the chosen radio after Space and arrows', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const changed = jest.fn()
    const watched = await renderWatched(changed)
    try {
      // La barre d'espace coche le choix qui a le focus : la ligne reste ouverte, et ce bouton radio
      // reste le même élément (il garde donc le focus du clavier).
      const now = screen.getByRole('radio', { name: NOW })
      await fireEvent(now, 'keyDown', key(' '))
      expect(changed).toHaveBeenLastCalledWith('now')
      expect(screen.getByRole('button', { name: rowName(NOW), expanded: true })).toBeTruthy()
      const sameRadio = screen.getByRole('radio', { name: NOW, checked: true }) === now
      expect(sameRadio).toBe(true)

      // La flèche passe au choix suivant, le coche et lui donne le focus ; la ligne reste ouverte.
      await fireEvent(screen.getByRole('radio', { name: NOW }), 'keyDown', key('ArrowDown'))
      expect(changed).toHaveBeenLastCalledWith('digest')
      expect(screen.getByRole('button', { name: rowName(DIGEST), expanded: true })).toBeTruthy()
      expect(screen.getByRole('radio', { name: DIGEST, checked: true })).toBeTruthy()
      expect(watched.focused().at(-1)).toBe(DIGEST)

      await fireEvent(screen.getByRole('radio', { name: DIGEST }), 'keyDown', key('ArrowDown'))
      expect(screen.getByRole('button', { name: rowName(NEVER), expanded: true })).toBeTruthy()
      expect(watched.focused().at(-1)).toBe(NEVER)
    } finally {
      watched.restore()
    }
  })
})
