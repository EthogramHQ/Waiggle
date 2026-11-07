// Tests des gardes de `CommentComposer` qui s'ajoutent à la commande (`CommentComposer.test.tsx`) :
// ce qui décrit le champ, ce qui attend pendant un envoi, et le focus qui ne se perd pas quand un
// contrôle disparaît ou devient inactif.
import { fireEvent, screen } from '@testing-library/react-native'
import { type ComponentProps, createRef } from 'react'
import { Platform, TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentComposer } from './CommentComposer'
import { holdsFocus } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// `holdsFocus` lit le document du navigateur, absent ici : c'est sa réponse qui décide.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  holdsFocus: jest.fn(() => false),
}))

const caption = fr.t(($) => $.project.comments.hint)
const error = fr.t(($) => $.project.comments.error)
const retryLabel = fr.t(($) => $.common.retry)
const fieldName = fr.t(($) => $.project.comments.add)

type Props = ComponentProps<typeof CommentComposer>

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

const field = () => screen.getByLabelText(fieldName)

/** Un `document` du navigateur prêté, complet en apparence ; rien n'y a le focus. */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })
const lendDocument = () => {
  jest.replaceProperty(Platform, 'OS', 'web')
  Object.defineProperty(globalThis, 'document', {
    value: new Proxy({ activeElement: null } as Record<string | symbol, unknown>, {
      get: (target, key) => (key in target ? target[key] : loose()),
      set: () => true,
    }),
    configurable: true,
  })
}
const returnDocument = () => {
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'document')
}

describe('CommentComposer, its guards', () => {
  describe('what describes the field', () => {
    it('reads who will read the comment when arriving on the field', async () => {
      await renderWithProviders(<CommentComposer {...propsOf()} />)

      expect(field().props.accessibilityHint).toBe(caption)
    })

    it('also reads whom the member replies to, the focus arriving in the field', async () => {
      await renderWithProviders(
        <CommentComposer {...propsOf({ banner: { kind: 'reply', name: 'Léa Moreau' } })} />,
      )

      expect(field().props.accessibilityHint).toBe(`Réponse à Léa Moreau ${caption}`)
    })

    it('links the field to these texts by aria-describedby, on the web', async () => {
      lendDocument()
      try {
        await renderWithProviders(<CommentComposer {...propsOf({ banner: { kind: 'edit' } })} />)

        const ids = String(field().props['aria-describedby']).split(' ')
        expect(ids).toHaveLength(2)
        expect(screen.getByText(caption).props.nativeID).toBe(ids[1])
      } finally {
        returnDocument()
      }
    })
  })

  describe('while sending', () => {
    it('freezes the text', async () => {
      await renderWithProviders(<CommentComposer {...propsOf({ value: 'Merci', pending: true })} />)

      expect(field().props.editable).toBe(false)
    })

    it('the cross of the banner waits: the comment leaves anyway', async () => {
      const onCancelBanner = jest.fn()
      await renderWithProviders(
        <CommentComposer
          {...propsOf({
            value: 'Merci',
            pending: true,
            banner: { kind: 'edit' },
            onCancelBanner,
          })}
        />,
      )

      const cross = screen.getByRole('button', { name: 'Annuler la modification' })
      expect(cross).toBeDisabled()
      await fireEvent.press(cross)

      expect(onCancelBanner).not.toHaveBeenCalled()
    })

    it('keeps the error shown until the answer, and removes it after a success', async () => {
      const action = { label: retryLabel, onPress: jest.fn() }
      const failed = propsOf({ value: 'Merci', error, errorAction: action })
      const { rerender } = await renderWithProviders(<CommentComposer {...failed} />)
      expect(screen.getByRole('alert')).toHaveTextContent(error)

      // Le nouvel envoi efface l'erreur de React Query : elle reste à l'écran jusqu'à la réponse.
      await rerender(
        <CommentComposer {...failed} pending error={undefined} errorAction={undefined} />,
      )
      expect(screen.getByRole('alert')).toHaveTextContent(error)

      await rerender(<CommentComposer {...failed} error={undefined} errorAction={undefined} />)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('« Réessayer » sends nothing while a sending is under way', async () => {
      const onPress = jest.fn()
      await renderWithProviders(
        <CommentComposer
          {...propsOf({
            value: 'Merci',
            pending: true,
            error,
            errorAction: { label: retryLabel, onPress },
          })}
        />,
      )

      await fireEvent.press(
        screen.queryByRole('link', { name: retryLabel }) ??
          screen.getByRole('button', { name: retryLabel }),
      )

      expect(onPress).not.toHaveBeenCalled()
    })

    it('« Réessayer » retries once on a double tap', async () => {
      const onPress = jest.fn()
      await renderWithProviders(
        <CommentComposer
          {...propsOf({ value: 'Merci', error, errorAction: { label: retryLabel, onPress } })}
        />,
      )
      const retry = () =>
        screen.queryByRole('link', { name: retryLabel }) ??
        screen.getByRole('button', { name: retryLabel })

      await fireEvent.press(retry())
      await fireEvent.press(retry())

      expect(onPress).toHaveBeenCalledTimes(1)
    })
  })

  describe('Escape in the field, on the web', () => {
    const pressEscape = async () => {
      const preventDefault = jest.fn()
      await fireEvent(field(), 'keyPress', { nativeEvent: { key: 'Escape', preventDefault } })
      return preventDefault
    }

    it('closes the banner, and the sheet does not take the key (preventDefault)', async () => {
      lendDocument()
      try {
        const onCancelBanner = jest.fn()
        await renderWithProviders(
          <CommentComposer {...propsOf({ banner: { kind: 'edit' }, onCancelBanner })} />,
        )

        const preventDefault = await pressEscape()

        expect(onCancelBanner).toHaveBeenCalledTimes(1)
        expect(preventDefault).toHaveBeenCalled()
      } finally {
        returnDocument()
      }
    })

    it('without a banner, leaves the key to the sheet', async () => {
      lendDocument()
      try {
        await renderWithProviders(<CommentComposer {...propsOf()} />)

        expect(await pressEscape()).not.toHaveBeenCalled()
      } finally {
        returnDocument()
      }
    })

    it('while sending, the banner stays', async () => {
      lendDocument()
      try {
        const onCancelBanner = jest.fn()
        await renderWithProviders(
          <CommentComposer
            {...propsOf({
              value: 'Merci',
              pending: true,
              banner: { kind: 'edit' },
              onCancelBanner,
            })}
          />,
        )

        await pressEscape()

        expect(onCancelBanner).not.toHaveBeenCalled()
      } finally {
        returnDocument()
      }
    })
  })

  describe('the focus, on the web', () => {
    /** L'espion de `focus` des saisies, sans les appels des tests d'avant. */
    const spyOnFocus = () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus')
      focus.mockClear()
      return focus
    }

    beforeEach(() => {
      jest.mocked(holdsFocus).mockReturnValue(false)
    })

    it('goes back to the field when the send button holding it becomes inactive', async () => {
      lendDocument()
      const focus = spyOnFocus()
      try {
        const { rerender } = await renderWithProviders(
          <CommentComposer {...propsOf({ value: 'Merci' })} />,
        )
        expect(focus).not.toHaveBeenCalled()

        // Le commentaire est parti, l'écran a vidé le champ : le bouton qui a le focus devient inactif.
        jest.mocked(holdsFocus).mockReturnValue(true)
        await rerender(<CommentComposer {...propsOf({ value: '' })} />)

        expect(focus).toHaveBeenCalledWith({ preventScroll: true })
      } finally {
        focus.mockRestore()
        returnDocument()
      }
    })

    it('stays where it is when the send button does not hold it', async () => {
      lendDocument()
      const focus = spyOnFocus()
      try {
        const { rerender } = await renderWithProviders(
          <CommentComposer {...propsOf({ value: 'Merci' })} />,
        )

        await rerender(<CommentComposer {...propsOf({ value: '' })} />)

        expect(focus).not.toHaveBeenCalled()
      } finally {
        focus.mockRestore()
        returnDocument()
      }
    })

    it('goes back to the field when the link « Réessayer » that held it disappears', async () => {
      lendDocument()
      const focus = spyOnFocus()
      try {
        const failed = propsOf({
          value: 'Merci',
          error,
          errorAction: { label: retryLabel, onPress: jest.fn() },
        })
        const { rerender } = await renderWithProviders(<CommentComposer {...failed} />)
        expect(focus).not.toHaveBeenCalled()

        await rerender(<CommentComposer {...failed} error={undefined} errorAction={undefined} />)

        expect(focus).toHaveBeenCalledWith({ preventScroll: true })
      } finally {
        focus.mockRestore()
        returnDocument()
      }
    })
  })
})
