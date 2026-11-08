// Tests du champ d'un prompt (tranche R6a, planche `R6-Publier-Suite`) : « Le prompt de départ » et
// « Les autres prompts » du formulaire de publication.
// - Son compteur est toujours visible (« 148 / 4 000 »), avec l'aide « Retire ce qui est
//   personnel… ».
// - Un texte collé est nettoyé à la saisie par `cleanPrompt` (le contrat) : les caractères
//   invisibles sont retirés, une ligne le dit (et l'annonce), et le curseur reste après le texte
//   collé (relecture du plan, ui-I9).
// - Une clé d'API collée (`findApiKeys`, le contrat) est montrée masquée dans un encadré sous le
//   champ (« Clé : sk-proj…a91f »), avec l'avertissement du juridique et « Retirer la clé », qui la
//   remplace par « [clé retirée] » (`removeApiKey`). Le champ ne surligne pas une partie de son
//   texte (ui-I9). En modification, une clé déjà enregistrée ajoute « désactive-la chez son
//   fournisseur » (jur-J12).
// - La clé ne sort jamais du champ et de l'encadré : ni console, ni stockage (sec-A5).
//
// L'API du composant (découpage de R6a, U3b, complétée par ce fichier) :
// PromptField({ label; value; onChange(text); max; hint; labels; removedPlaceholder; savedValue?;
// error? }), avec labels = { counter(count, max) → { shown; spoken }; invisibleRemoved(count);
// keyFound(masked); keyWarning; keyRevoke; removeKey; removeKeyNamed(masked) } ; `savedValue` est le
// prompt tel qu'il est enregistré (modification) : une clé qui s'y trouve déjà est « déjà enregistrée ».
import AsyncStorage from '@react-native-async-storage/async-storage'
import { layout } from '@ruche/brand'
import { findApiKeys } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, StyleSheet, TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from './focus'
import { PromptField } from './PromptField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Où le composant pose le focus du clavier (web) : le test lit l'élément reçu.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

// Les caractères invisibles s'écrivent par leur numéro : écrits tels quels, on ne les verrait pas.
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)

// De fausses clés, de la forme des vraies. Écrites en morceaux : un outil qui cherche les secrets
// dans le dépôt public ne doit pas les prendre pour de vraies clés.
const OPENAI_KEY = ['sk-proj', '-Zq8xT2mN4vR7wK1pL9sD3fG6hJ0', 'a91f'].join('')
const GITHUB_KEY = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6', 'wxyz'].join('')

/** La forme masquée d'une clé, telle que la calcule le contrat. */
const maskedOf = (key: string) => {
  const found = findApiKeys(key)[0]
  if (!found) throw new Error(`no key found in ${key.slice(0, 4)}…`)
  return found.masked
}

const LABEL = fr.t(($) => $.project.prompts.starting)
const HINT = fr.t(($) => $.project.form.promptHint)
const MAX = 4000
const PLACEHOLDER = fr.t(($) => $.project.form.keyRemoved)
const labels = {
  counter: (count: number, max: number) => ({
    shown: fr.t(($) => $.project.form.promptCounter, { count, max }),
    spoken: fr.t(($) => $.project.form.promptCounterSpoken, { count, max }),
  }),
  invisibleRemoved: (count: number) => fr.t(($) => $.project.form.invisibleRemoved, { count }),
  keyFound: (masked: string) => fr.t(($) => $.project.form.keyFound, { masked }),
  keyWarning: fr.t(($) => $.project.form.keyWarning),
  keyRevoke: fr.t(($) => $.project.form.keyRevoke),
  removeKey: fr.t(($) => $.project.form.removeKey),
  removeKeyNamed: (masked: string) => fr.t(($) => $.project.form.removeKeyNamed, { masked }),
}

/** Le champ, avec sa valeur gardée comme dans le formulaire ; `onChange` voit chaque texte reçu. */
function Field({
  initial = '',
  savedValue,
  onChange,
}: {
  initial?: string
  savedValue?: string
  onChange?: (text: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <PromptField
      label={LABEL}
      value={value}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
      max={MAX}
      hint={HINT}
      labels={labels}
      removedPlaceholder={PLACEHOLDER}
      {...(savedValue !== undefined ? { savedValue } : null)}
    />
  )
}

/** La saisie du champ, trouvée par son nom. */
const input = () => screen.getByLabelText(LABEL)

type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent?: Host
}

/** Tous les éléments de l'arbre rendu, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Vrai si l'élément, ou un parent, est une région annoncée poliment (statut ou `polite`). */
const politelyAnnounced = (element: unknown): boolean => {
  let polite = false
  for (let node = element as Host | undefined; node; node = node.parent) {
    const { role, accessibilityRole, accessibilityLiveRegion } = node.props
    const values = [role, accessibilityRole, node.props['aria-live'], accessibilityLiveRegion].map(
      String,
    )
    if (values.some((value) => value === 'alert' || value === 'assertive')) return false
    if (values.some((value) => value === 'polite' || value === 'status')) polite = true
  }
  return polite
}

/**
 * Un faux document du navigateur, le temps d'un test « web » : toute méthode existe et ne fait rien,
 * <html> et <body> ont un style (ThemeProvider y écrit la couleur de la page).
 */
const fakeDocument = (): object => {
  const node = (extra: Record<string, unknown> = {}): object =>
    new Proxy(
      {
        style: { setProperty: jest.fn(), removeProperty: jest.fn() },
        visibilityState: 'visible',
        hidden: false,
        activeElement: null,
        ...extra,
      } as Record<string | symbol, unknown>,
      {
        get(target, key) {
          if (key === 'then') return undefined
          if (!(key in target)) {
            target[key] =
              key === 'documentElement' || key === 'body' || key === 'head'
                ? node()
                : jest.fn(() => undefined)
          }
          return target[key]
        },
      },
    )
  return node()
}

/** La hauteur que le doigt peut toucher : la boîte du bouton, plus son débord (`hitSlop`). */
const touchHeight = (node: Host): number => {
  const style = StyleSheet.flatten(node.props.style as never) as {
    minHeight?: unknown
    height?: unknown
  } | null
  const own = Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
  const slop: unknown = node.props.hitSlop
  const extra =
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as { top?: number }).top ?? 0) +
          Number((slop as { bottom?: number }).bottom ?? 0)
        : 0
  return own + extra
}

describe('PromptField', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('shows its counter and its hint at all times, from the first character', async () => {
    await renderWithProviders(<Field />)

    expect(screen.getByText(labels.counter(0, MAX).shown)).toBeTruthy()
    expect(screen.getByText(HINT)).toBeTruthy()

    await fireEvent.changeText(input(), 'a'.repeat(148))

    expect(screen.getByText(labels.counter(148, MAX).shown)).toBeTruthy()
  })

  it('removes the invisible characters of a pasted text and says how many', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field onChange={onChange} />)
    expect(screen.queryByText(labels.invisibleRemoved(2))).toBeNull() // témoin

    await fireEvent.changeText(
      input(),
      `Résume${ZERO_WIDTH_SPACE} ce texte${RIGHT_TO_LEFT_OVERRIDE} en trois points.`,
    )

    expect(onChange).toHaveBeenLastCalledWith('Résume ce texte en trois points.')
    expect(screen.getByText(labels.invisibleRemoved(2))).toBeTruthy()
    expect(labels.invisibleRemoved(2)).toBe('2 caractères invisibles ont été retirés.')
  })

  it('announces the removed invisible characters', async () => {
    await renderWithProviders(<Field />)

    await fireEvent.changeText(input(), `Bonjour${ZERO_WIDTH_SPACE}`)

    expect(politelyAnnounced(screen.getByText(labels.invisibleRemoved(1)))).toBe(true)
  })

  it('keeps the caret after the pasted text when invisible characters are removed (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', { value: fakeDocument(), configurable: true })
    const onChange = jest.fn()
    await renderWithProviders(<Field initial="Début fin" onChange={onChange} />)

    // Le curseur après « Début » (6), on colle « A·B·C » (deux invisibles) : le navigateur rend le
    // texte avec les invisibles, le champ les retire.
    await fireEvent(input(), 'selectionChange', {
      nativeEvent: { selection: { start: 6, end: 6 } },
    })
    await fireEvent.changeText(input(), `Début A${ZERO_WIDTH_SPACE}B${ZERO_WIDTH_SPACE}Cfin`)

    expect(onChange).toHaveBeenLastCalledWith('Début ABCfin')
    // Le curseur se pose juste après « ABC » (9), ni deux plus loin (les invisibles comptés), ni à
    // la fin du texte.
    expect(input().props.selection).toEqual({ start: 9, end: 9 })
  })

  it('shows a pasted API key masked, with the warning, and removes it', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field onChange={onChange} />)
    expect(screen.queryByText(labels.keyWarning)).toBeNull() // témoin : rien sans clé
    expect(maskedOf(OPENAI_KEY)).toBe('sk-proj…a91f')

    await fireEvent.changeText(input(), `Réponds en français. Ma clé : ${OPENAI_KEY} merci`)

    expect(screen.getByText(labels.keyFound('sk-proj…a91f'))).toBeTruthy()
    expect(screen.getByText(labels.keyWarning)).toBeTruthy()
    // Une nouvelle clé n'a jamais été visible : pas encore de « désactive-la ».
    expect(screen.queryByText(labels.keyRevoke)).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: labels.removeKey }))

    expect(onChange).toHaveBeenLastCalledWith(`Réponds en français. Ma clé : ${PLACEHOLDER} merci`)
    expect(PLACEHOLDER).toBe('[clé retirée]')
    expect(screen.queryByText(labels.keyWarning)).toBeNull()
  })

  it('finds a key split by an invisible character, once the text is cleaned', async () => {
    await renderWithProviders(<Field />)

    // sec-A4 : la recherche se fait sur le texte nettoyé, celui qu'on voit et qu'on publie.
    const split = `${OPENAI_KEY.slice(0, 12)}${ZERO_WIDTH_SPACE}${OPENAI_KEY.slice(12)}`
    await fireEvent.changeText(input(), `Clé ${split}`)

    expect(screen.getByText(labels.keyFound('sk-proj…a91f'))).toBeTruthy()
  })

  it('names each remove button with its masked key when there are several', async () => {
    const onChange = jest.fn()
    await renderWithProviders(<Field onChange={onChange} />)

    await fireEvent.changeText(input(), `Clés : ${OPENAI_KEY} et ${GITHUB_KEY}.`)

    const first = labels.removeKeyNamed(maskedOf(OPENAI_KEY))
    const second = labels.removeKeyNamed(maskedOf(GITHUB_KEY))
    expect(first).toBe('Retirer la clé sk-proj…a91f')
    expect(screen.getByRole('button', { name: first })).toBeTruthy()
    expect(screen.getByRole('button', { name: second })).toBeTruthy()
    expect(screen.queryByRole('button', { name: labels.removeKey })).toBeNull()

    // La première retirée, les positions de la seconde sont recalculées : elle reste seule, et son
    // bouton reprend le nom court.
    await fireEvent.press(screen.getByRole('button', { name: first }))

    expect(onChange).toHaveBeenLastCalledWith(`Clés : ${PLACEHOLDER} et ${GITHUB_KEY}.`)
    expect(screen.getByText(labels.keyFound(maskedOf(GITHUB_KEY)))).toBeTruthy()
    expect(screen.getByRole('button', { name: labels.removeKey })).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: labels.removeKey }))
    expect(onChange).toHaveBeenLastCalledWith(`Clés : ${PLACEHOLDER} et ${PLACEHOLDER}.`)
  })

  it('gives the focus back to the field when the last key is removed', async () => {
    // Le focus peut arriver par focusWithoutScroll (web, sans défilement) ou par le focus() du
    // champ : on retient le dernier arrivé, quelle que soit la voie.
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    focus.mockClear()
    jest.mocked(focusWithoutScroll).mockClear()
    await renderWithProviders(<Field initial={`Ma clé ${OPENAI_KEY}`} />)

    await fireEvent.press(screen.getByRole('button', { name: labels.removeKey }))

    // Le bouton touché a disparu avec la clé : le focus revient au champ, pas au haut de la page.
    await waitFor(() => {
      const arrivals = [
        ...jest.mocked(focusWithoutScroll).mock.calls.map((call, index) => ({
          order: jest.mocked(focusWithoutScroll).mock.invocationCallOrder[index] ?? 0,
          node: call[0] as unknown as Host | undefined,
        })),
        ...focus.mock.contexts.map((context, index) => ({
          order: focus.mock.invocationCallOrder[index] ?? 0,
          node: context as unknown as Host | undefined,
        })),
      ].sort((a, b) => a.order - b.order)
      expect(arrivals.at(-1)?.node?.props.accessibilityLabel).toBe(LABEL)
    })
  })

  it('gives the remove button a 44-point touch target', async () => {
    await renderWithProviders(<Field initial={`Ma clé ${OPENAI_KEY}`} />)

    const button = screen.getByRole('button', { name: labels.removeKey }) as unknown as Host
    expect(touchHeight(button)).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('never writes the prompt or the masked key outside the field', async () => {
    // sec-A5 : ni la console, ni le stockage de l'appareil ne reçoivent le prompt ou la clé, même
    // masquée ; à l'écran, la clé entière n'est que dans le champ.
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    )
    const storage = (['setItem', 'mergeItem', 'multiSet', 'multiMerge'] as const).map((method) => {
      const spy = jest.spyOn(AsyncStorage, method)
      spy.mockClear()
      return spy
    })
    const prompt = `Prompt secret de Léa : ${OPENAI_KEY}`
    await renderWithProviders(<Field />)

    await fireEvent.changeText(input(), prompt)
    expect(screen.getByText(labels.keyFound(maskedOf(OPENAI_KEY)))).toBeTruthy() // témoin

    // La clé entière : seulement dans la valeur du champ, dans aucun texte ni nom lu ailleurs.
    const field = input() as unknown as Host
    for (const node of hostsOf(screen.root as unknown as Host)) {
      if (node === field) continue
      const own = [
        ...node.children.filter((child): child is string => typeof child === 'string'),
        ...Object.values(node.props).filter((value): value is string => typeof value === 'string'),
      ]
      for (const text of own) expect(text).not.toContain(OPENAI_KEY)
    }

    await fireEvent.press(screen.getByRole('button', { name: labels.removeKey }))

    for (const spy of [...consoles, ...storage]) {
      const written = JSON.stringify(spy.mock.calls)
      expect(written).not.toContain(OPENAI_KEY)
      expect(written).not.toContain(maskedOf(OPENAI_KEY))
      expect(written).not.toContain('Prompt secret de Léa')
    }
  })

  it('asks to revoke a key already saved in the prompt', async () => {
    const saved = `Mon prompt avec ${OPENAI_KEY}`
    // Témoin : une clé qui n'était pas dans le prompt enregistré n'a jamais été visible.
    await renderWithProviders(<Field initial={saved} savedValue="Mon prompt" />)
    expect(screen.getByText(labels.keyWarning)).toBeTruthy()
    expect(screen.queryByText(labels.keyRevoke)).toBeNull()

    // La même clé, déjà enregistrée : la retirer ne suffit pas, il faut la désactiver.
    await screen.rerender(<Field initial={saved} savedValue={saved} />)

    expect(screen.getByText(labels.keyWarning)).toBeTruthy()
    expect(screen.getByText(labels.keyRevoke)).toBeTruthy()
    expect(labels.keyRevoke).toMatch(/désactive-la chez son fournisseur\.$/)
  })
})
