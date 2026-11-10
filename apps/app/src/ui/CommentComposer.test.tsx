// Tests du champ compact des commentaires (R5b, `CommentComposer`), fixé en bas de la feuille (et
// sous la liste, dans la colonne de droite d'un écran large) : la photo du membre, le champ qui
// propose des mentions après « @ », le bouton d'envoi (une flèche ronde ; « Envoyer » en texte dans
// la colonne), le bandeau « Réponse à … » ou « Modifier ton commentaire » au-dessus avec sa croix,
// le compteur à partir de 900 caractères, l'erreur au-dessus du champ avec « Réessayer », et la
// légende dessous, qui dit qui lira (donnée par l'écran : relecture juridique jur-P1).
//
// Les gardes reprises de `NoteComposer` (Découpage du plan R5b) : rien ne part d'un champ vide ou
// fait d'espaces, un double toucher n'envoie qu'une fois, l'envoi en cours est annoncé « occupé »,
// le texte reste dans le champ après une erreur, et le focus revient au champ quand on ferme le
// bandeau. Le composant ne garde aucun état du texte : l'écran (`useCommentDraft`) le lui donne.
//
// Le membre suspendu n'a pas de champ du tout (l'écran ne le rend pas : ui-I1) ; ce cas est testé
// avec l'écran.
import { COMMENT_COUNTER_FROM, COMMENT_MAX } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { type ComponentProps, createRef, useState } from 'react'
import { Dimensions, Platform, StyleSheet, TextInput } from 'react-native'
import { inesMember } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentComposer } from './CommentComposer'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const sendLabel = fr.t(($) => $.project.comments.sendLabel)
const sendShort = fr.t(($) => $.project.comments.send)
const caption = fr.t(($) => $.project.comments.hint)

type Props = ComponentProps<typeof CommentComposer>

/** Les réglages d'un champ ordinaire, dans la feuille ; chaque test change ce qui l'intéresse. */
const propsOf = (fields: Partial<Props> = {}): Props => ({
  value: '',
  onChangeText: jest.fn(),
  onSend: jest.fn(),
  pending: false,
  banner: null,
  onCancelBanner: jest.fn(),
  caption,
  avatar: null,
  memberName: 'Sam Petit',
  place: 'sheet',
  suggestions: [],
  suggestionsFor: null,
  onQueryChange: jest.fn(),
  inputRef: createRef<TextInput>(),
  ...fields,
})

type Host = {
  type?: unknown
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent: Host | null
}

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (en profondeur). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

/** La saisie du champ : le seul champ de texte natif du composant. */
const field = () => {
  const found = all().find((node) => node.type === 'TextInput')
  if (!found) throw new Error('no text input')
  return found
}

/** Le style aplati d'un élément : une mise en page ne se dit pas autrement sous Jest. */
const styleOf = (node: Host) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>

/** La place d'un élément dans l'ordre de lecture. */
const place = (node: unknown) => all().indexOf(node as Host)

/** Le bouton d'envoi de la feuille : la flèche ronde, nommée « Envoyer le commentaire ». */
const sendButton = () => screen.getByRole('button', { name: sendLabel })

/**
 * Le texte est annoncé poliment : il est dans une région vivante polie (ou un `status`), et aucune
 * région qui coupe la parole (`alert`, `assertive`) ne l'entoure.
 */
const politelyAnnounced = (element: unknown): boolean => {
  let polite = false
  for (let node = element as Host | null; node; node = node.parent) {
    const { role, accessibilityRole, accessibilityLiveRegion } = node.props
    const values = [role, accessibilityRole, node.props['aria-live'], accessibilityLiveRegion].map(
      String,
    )
    if (values.some((value) => value === 'alert' || value === 'assertive')) return false
    if (values.some((value) => value === 'polite' || value === 'status')) polite = true
  }
  return polite
}

/** Un `document` du navigateur prêté, complet en apparence (ThemeProvider y écrit, sur le web). */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })

describe('CommentComposer', () => {
  describe('sending', () => {
    it('sends what is written when the arrow is touched (témoin)', async () => {
      const onSend = jest.fn()
      await renderWithProviders(<CommentComposer {...propsOf({ value: 'Merci !', onSend })} />)

      expect(sendButton()).not.toBeDisabled()
      await fireEvent.press(sendButton())

      expect(onSend).toHaveBeenCalledTimes(1)
    })

    it('greys out the send button and refuses to send while the field is empty', async () => {
      const onSend = jest.fn()
      await renderWithProviders(<CommentComposer {...propsOf({ value: '', onSend })} />)

      expect(sendButton()).toBeDisabled()
      await fireEvent.press(sendButton())

      expect(onSend).not.toHaveBeenCalled()
    })

    it('a text made only of spaces cannot be sent', async () => {
      const onSend = jest.fn()
      await renderWithProviders(<CommentComposer {...propsOf({ value: '  \n   ', onSend })} />)

      expect(sendButton()).toBeDisabled()
      await fireEvent.press(sendButton())

      expect(onSend).not.toHaveBeenCalled()
    })

    it('sends once on a double tap of the arrow', async () => {
      // L'écran n'a pas encore passé `pending` quand la seconde tape arrive : la garde est celle du
      // bouton lui-même (une `ref`, comme `useTapGuard`).
      const onSend = jest.fn()
      await renderWithProviders(<CommentComposer {...propsOf({ value: 'Merci !', onSend })} />)

      await fireEvent.press(sendButton())
      await fireEvent.press(sendButton())

      expect(onSend).toHaveBeenCalledTimes(1)
    })

    it('the send button is announced busy while sending and ignores presses', async () => {
      const onSend = jest.fn()
      await renderWithProviders(
        <CommentComposer {...propsOf({ value: 'Merci !', onSend, pending: true })} />,
      )

      const button = sendButton()
      expect(
        button.props['aria-busy'] === true ||
          (button.props.accessibilityState as { busy?: boolean } | undefined)?.busy === true,
      ).toBe(true)
      await fireEvent.press(button)

      expect(onSend).not.toHaveBeenCalled()
    })

    it('in the column of a wide screen, sends with a text button « Envoyer »', async () => {
      const onSend = jest.fn()
      await renderWithProviders(
        <CommentComposer {...propsOf({ value: 'Merci !', onSend, place: 'column' })} />,
      )

      // Le bouton porte le mot « Envoyer » à voir ; on remonte du texte au bouton qui le contient.
      let button = screen.getByText(sendShort) as unknown as Host | null
      while (
        button &&
        button.props.accessibilityRole !== 'button' &&
        button.props.role !== 'button'
      ) {
        button = button.parent
      }
      expect(button).not.toBeNull()
      await fireEvent.press(button as never)

      expect(onSend).toHaveBeenCalledTimes(1)
    })

    it('in the sheet, the arrow has no visible word (témoin)', async () => {
      await renderWithProviders(<CommentComposer {...propsOf({ value: 'Merci !' })} />)

      expect(sendButton()).toBeTruthy()
      expect(screen.queryByText(sendShort)).toBeNull()
    })
  })

  describe('the counter, near the limit', () => {
    it('the counter is absent at 899 characters and reads « 900 / 1000 » at 900', async () => {
      expect(COMMENT_COUNTER_FROM).toBe(900)
      const { rerender } = await renderWithProviders(
        <CommentComposer {...propsOf({ value: 'a'.repeat(899) })} />,
      )
      expect(screen.queryByText(/\/\s*1\s?000/)).toBeNull()

      await rerender(<CommentComposer {...propsOf({ value: 'a'.repeat(900) })} />)

      expect(screen.getByText('900 / 1000')).toBeTruthy()
    })

    it('at 1001 characters the field is invalid, sending is refused and « 1 caractère de trop. » is announced politely', async () => {
      // « Saisie invalide » se dit sur le web (`aria-invalid`), comme pour tout champ de l'appli.
      jest.replaceProperty(Platform, 'OS', 'web')
      Object.defineProperty(globalThis, 'document', {
        value: new Proxy({ activeElement: null } as Record<string | symbol, unknown>, {
          get: (target, key) => (key in target ? target[key] : loose()),
          set: () => true,
        }),
        configurable: true,
      })
      try {
        const onSend = jest.fn()
        await renderWithProviders(
          <CommentComposer {...propsOf({ value: 'a'.repeat(COMMENT_MAX + 1), onSend })} />,
        )

        expect(field().props['aria-invalid']).toBe(true)
        await fireEvent.press(sendButton())
        expect(onSend).not.toHaveBeenCalled()
        const tooLong = fr.t(($) => $.project.comments.tooLong, { count: 1 })
        expect(tooLong).toBe('1 caractère de trop.')
        expect(politelyAnnounced(screen.getByText(tooLong))).toBe(true)
      } finally {
        jest.restoreAllMocks()
        Reflect.deleteProperty(globalThis, 'document')
      }
    })

    it('at the limit itself, 1000 characters still go (témoin)', async () => {
      const onSend = jest.fn()
      await renderWithProviders(
        <CommentComposer {...propsOf({ value: 'a'.repeat(COMMENT_MAX), onSend })} />,
      )

      expect(screen.getByText('1000 / 1000')).toBeTruthy()
      await fireEvent.press(sendButton())

      expect(onSend).toHaveBeenCalledTimes(1)
    })
  })

  describe('the banner above the field', () => {
    it('the reply banner reads « Réponse à Léa Moreau », and its cross « Annuler la réponse » gives the focus back to the field', async () => {
      // Sur téléphone comme sur le web, le focus va au champ par son `focus()` : le clavier reste
      // ouvert, on continue d'écrire. La saisie simulée garde les appels des tests d'avant.
      const focus = jest.spyOn(TextInput.prototype, 'focus')
      focus.mockClear()
      try {
        const onCancelBanner = jest.fn()
        await renderWithProviders(
          <CommentComposer
            {...propsOf({ banner: { kind: 'reply', name: 'Léa Moreau' }, onCancelBanner })}
          />,
        )

        expect(screen.getByText('Réponse à Léa Moreau')).toBeTruthy()
        await fireEvent.press(screen.getByRole('button', { name: 'Annuler la réponse' }))

        expect(onCancelBanner).toHaveBeenCalledTimes(1)
        expect(focus).toHaveBeenCalled()
        expect(field().props.accessibilityLabel).toEqual(expect.any(String))
        expect((focus.mock.contexts.at(-1) as unknown as Host).props.accessibilityLabel).toBe(
          field().props.accessibilityLabel,
        )
      } finally {
        focus.mockRestore()
      }
    })

    it('the edit banner reads « Modifier ton commentaire », and its cross « Annuler la modification » cancels it', async () => {
      const onCancelBanner = jest.fn()
      await renderWithProviders(
        <CommentComposer
          {...propsOf({ value: 'Mon texte', banner: { kind: 'edit' }, onCancelBanner })}
        />,
      )

      expect(screen.getByText('Modifier ton commentaire')).toBeTruthy()
      await fireEvent.press(screen.getByRole('button', { name: 'Annuler la modification' }))

      expect(onCancelBanner).toHaveBeenCalledTimes(1)
    })

    it('shows no banner for a new comment', async () => {
      await renderWithProviders(<CommentComposer {...propsOf({ value: 'Merci !' })} />)

      expect(sendButton()).toBeTruthy() // témoin
      expect(screen.queryByRole('button', { name: 'Annuler la réponse' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Annuler la modification' })).toBeNull()
    })
  })

  describe('around the field', () => {
    it('shows an error above the field, with « Réessayer », and keeps the text', async () => {
      const retry = jest.fn()
      const error = fr.t(($) => $.project.comments.error)
      await renderWithProviders(
        <CommentComposer
          {...propsOf({
            value: 'Merci !',
            error,
            errorAction: { label: fr.t(($) => $.common.retry), onPress: retry },
          })}
        />,
      )

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(error)
      expect(place(alert)).toBeLessThan(place(field()))
      expect(field().props.value).toBe('Merci !')
      await fireEvent.press(
        screen.queryByRole('link', { name: 'Réessayer' }) ??
          screen.getByRole('button', { name: 'Réessayer' }),
      )

      expect(retry).toHaveBeenCalledTimes(1)
    })

    it('shows under the field who will read the comment', async () => {
      await renderWithProviders(<CommentComposer {...propsOf()} />)

      expect(place(screen.getByText(caption))).toBeGreaterThan(place(field()))
    })

    it('names its field « Écrire un commentaire », not « Ton commentaire »', async () => {
      // Décision (R5b) : « Ton commentaire » est déjà le nom lu du fond des siens
      // (`comments.yours`) ; le champ prend `comments.add`.
      await renderWithProviders(<CommentComposer {...propsOf()} />)

      expect(field().props.accessibilityLabel).toBe(fr.t(($) => $.project.comments.add))
      expect(field().props.accessibilityLabel).toBe('Écrire un commentaire')
    })

    it('gives its text input to inputRef, for the screen to put the focus in it', async () => {
      const inputRef = createRef<TextInput>()
      await renderWithProviders(<CommentComposer {...propsOf({ inputRef })} />)

      expect(inputRef.current).not.toBeNull()
      expect(field().props.accessibilityLabel).toEqual(expect.any(String))
      expect((inputRef.current as unknown as Host).props.accessibilityLabel).toBe(
        field().props.accessibilityLabel,
      )
    })

    it('asks for members to mention after « @ », and lists them above the field', async () => {
      const onQueryChange = jest.fn()
      const ines = { ...inesMember, avatar: null }
      /** Le champ avec son texte gardé, comme dans l'écran ; la réponse répond à « in ». */
      function Typing() {
        const [value, setValue] = useState('')
        return (
          <CommentComposer
            {...propsOf({
              value,
              onChangeText: setValue,
              onQueryChange,
              suggestions: [ines],
              suggestionsFor: 'in',
            })}
          />
        )
      }
      await renderWithProviders(<Typing />)

      await fireEvent.changeText(field() as never, 'Merci @in')

      expect(onQueryChange.mock.calls.at(-1)?.[0]).toBe('in')
      const option = screen.getByRole('option', { name: /Inès Morel/ })
      expect(place(option)).toBeLessThan(place(field()))
    })

    it('opens the list of members above the banner, as wide as the composer', async () => {
      // des-A6 : dans la colonne du champ, la liste faisait 182 pt à 320 px, et passait sous le bandeau.
      const ines = { ...inesMember, avatar: null }
      function Typing() {
        const [value, setValue] = useState('')
        return (
          <CommentComposer
            {...propsOf({
              value,
              onChangeText: setValue,
              banner: { kind: 'reply', name: 'Léa Moreau' },
              suggestions: [ines],
              suggestionsFor: 'in',
            })}
          />
        )
      }
      await renderWithProviders(<Typing />)

      await fireEvent.changeText(field() as never, 'Merci @in')

      const option = screen.getByRole('option', { name: /Inès Morel/ })
      expect(place(option)).toBeLessThan(
        place(screen.getByRole('button', { name: 'Annuler la réponse' })),
      )
      // Hors de la rangée du champ : aucun ancêtre de la liste ne contient aussi la saisie, sauf le
      // bloc entier du composant, celui qui porte aussi le bandeau.
      const input = field()
      const contains = (node: Host): boolean => hostsOf(node).includes(input)
      let around = option as unknown as Host
      while (around.parent && !contains(around.parent)) around = around.parent
      const shared = around.parent as Host
      expect(contains(shared)).toBe(true)
      expect(hostsOf(shared)).toContain(screen.getByText('Réponse à Léa Moreau'))
    })
  })

  describe('the list of members in a low window', () => {
    afterEach(() => {
      const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
      Dimensions.set({ window: phone, screen: phone })
    })

    /** Le champ avec son texte, une recherche qui répond, et le cadre de la liste qui s'ouvre. */
    const listHeightIn = async (height: number, where: Props['place']) => {
      const size = { width: where === 'sheet' ? 844 : 1440, height, scale: 2, fontScale: 1 }
      Dimensions.set({ window: size, screen: size })
      function Typing() {
        const [value, setValue] = useState('')
        return (
          <CommentComposer
            {...propsOf({
              value,
              onChangeText: setValue,
              place: where,
              suggestions: [{ ...inesMember, avatar: null }],
              suggestionsFor: 'in',
            })}
          />
        )
      }
      await renderWithProviders(<Typing />)
      await fireEvent.changeText(field() as never, 'Merci @in')
      let at = screen.getByRole('option', { name: /Inès Morel/ }) as unknown as Host | null
      while (at && styleOf(at).maxHeight === undefined) at = at.parent
      return at ? styleOf(at).maxHeight : undefined
    }

    it('in the sheet, leaves the field in the window, however low', async () => {
      // La hauteur de la fenêtre moins l'en-tête de la feuille (143) et le reste du pied (161) ;
      // au moins de quoi lire un membre sous le titre.
      expect(await listHeightIn(508, 'sheet')).toBe(508 - 304)
    })

    it('in the sheet of a landscape phone, keeps room for one member', async () => {
      expect(await listHeightIn(390, 'sheet')).toBe(88)
    })

    it('in the column, the page scrolls: no limit', async () => {
      expect(await listHeightIn(500, 'column')).toBeUndefined()
    })
  })

  describe('the width left to the field in the column (des-C5)', () => {
    /** Le premier ancêtre de la saisie qui se donne une largeur de base, et son parent. */
    const fieldRow = () => {
      let at: Host | null = field()
      while (at && styleOf(at).flexBasis === undefined) at = at.parent
      if (!at?.parent) throw new Error('no base width around the field')
      return { group: at, row: at.parent }
    }

    it('in the column, the field keeps a real width and « Envoyer » goes below it when it would not', async () => {
      await renderWithProviders(<CommentComposer {...propsOf({ place: 'column' })} />)

      const { group, row } = fieldRow()
      // La photo (36), l'écart (8) et les 180 points du champ.
      expect(styleOf(group).flexBasis).toBeGreaterThanOrEqual(36 + 8 + 180)
      expect(styleOf(group).flexGrow).toBe(1)
      expect(styleOf(row).flexWrap).toBe('wrap')
      // À droite, une fois passé dessous.
      expect(styleOf(row).justifyContent).toBe('flex-end')
    })

    it('in the sheet, the arrow never leaves the row of the field', async () => {
      await renderWithProviders(<CommentComposer {...propsOf()} />)

      let at: Host | null = field()
      while (at) {
        expect(styleOf(at).flexWrap).not.toBe('wrap')
        at = at.parent
      }
    })
  })

  describe('the photo while replying (decision 20)', () => {
    const photo = () =>
      screen.queryAllByLabelText('Sam Petit', { includeHiddenElements: true }).length > 0
    const replying: Partial<Props> = { banner: { kind: 'reply', name: 'Léa Moreau' } }

    afterEach(() => {
      const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
      Dimensions.set({ window: phone, screen: phone })
    })

    const windowOf = (width: number) => {
      const size = { width, height: 844, scale: 2, fontScale: 1 }
      Dimensions.set({ window: size, screen: size })
    }

    it('keeps the photo from 360 points', async () => {
      windowOf(360)
      await renderWithProviders(<CommentComposer {...propsOf(replying)} />)

      expect(photo()).toBe(true)
    })

    it('drops the photo below 360 points, where the field would be too narrow', async () => {
      windowOf(359)
      await renderWithProviders(<CommentComposer {...propsOf(replying)} />)

      expect(field()).toBeTruthy() // témoin
      expect(photo()).toBe(false)
    })

    it('keeps the photo below 360 points when not replying', async () => {
      windowOf(320)
      await renderWithProviders(<CommentComposer {...propsOf()} />)

      expect(photo()).toBe(true)
    })

    it('keeps the same input when the photo goes, for the focus to stay in it', async () => {
      windowOf(320)
      const { rerender } = await renderWithProviders(<CommentComposer {...propsOf()} />)
      const focus = jest.spyOn(TextInput.prototype, 'focus')
      focus.mockClear()
      const before = field()

      await rerender(<CommentComposer {...propsOf(replying)} />)

      expect(photo()).toBe(false)
      expect(field()).toBe(before)
      focus.mockRestore()
    })
  })

  describe('the excerpt in the banner (decision 17)', () => {
    const replying = (excerpt?: string): Partial<Props> => ({
      banner: { kind: 'reply', name: 'Léa Moreau', ...(excerpt ? { excerpt } : null) },
    })
    const sentence = fr.t(($) => $.project.comments.replyToExcerpt, {
      name: 'Léa Moreau',
      excerpt: 'Revanche dimanche',
    })
    const tail = sentence.slice(sentence.indexOf('Moreau') + 'Moreau'.length)

    it('reminds the replied comment, on one line, the name kept whole', async () => {
      await renderWithProviders(
        <CommentComposer {...propsOf({ place: 'column', ...replying('Revanche dimanche') })} />,
      )

      expect(tail).toContain('Revanche dimanche')
      // Le nom d'un côté, jamais coupé (décision du 1/11) ; l'extrait de l'autre, sur une ligne.
      const name = screen.getByText('Réponse à Léa Moreau')
      expect(name.props.numberOfLines).toBeUndefined()
      expect(screen.getByText(tail).props.numberOfLines).toBe(1)
    })

    it('reads the name to whoever writes, not the excerpt', async () => {
      await renderWithProviders(
        <CommentComposer {...propsOf({ place: 'column', ...replying('Revanche dimanche') })} />,
      )

      const hint = String(field().props.accessibilityHint)
      expect(hint).toContain('Réponse à Léa Moreau')
      expect(hint).not.toContain('Revanche dimanche')
    })

    it('without an excerpt, the banner stays « Réponse à Léa Moreau » alone', async () => {
      await renderWithProviders(<CommentComposer {...propsOf(replying())} />)

      expect(screen.getByText('Réponse à Léa Moreau')).toBeTruthy()
      expect(screen.queryByText(tail)).toBeNull()
    })
  })
})
