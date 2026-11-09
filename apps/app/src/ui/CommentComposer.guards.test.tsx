// Tests des gardes de `CommentComposer` qui s'ajoutent à la commande (`CommentComposer.test.tsx`) :
// ce qui décrit le champ, ce qui attend pendant un envoi, et le focus qui ne se perd pas quand un
// contrôle disparaît ou devient inactif.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { type ComponentProps, createRef, useState } from 'react'
import { Platform, TextInput } from 'react-native'
import { useEditComment, usePostComment } from '../comments/api'
import { useCommentDraft } from '../comments/useCommentDraft'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentComposer } from './CommentComposer'
import { holdsFocus } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les écritures du brouillon, simulées : le brouillon lui-même est le vrai (voir plus bas).
jest.mock('../comments/api', () => ({ usePostComment: jest.fn(), useEditComment: jest.fn() }))

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
    // R6b (restes de R5b) : le champ ne se fige plus pendant l'envoi.  fermait le
    // clavier sur iOS ; la garde contre un second envoi est celle de la flèche, pas celle du champ.
    // (Ce test remplace « freezes the text », qui demandait l'inverse.)
    it('leaves the field editable while sending, so iOS keeps the keyboard open', async () => {
      await renderWithProviders(<CommentComposer {...propsOf({ value: 'Merci', pending: true })} />)

      expect(field().props.editable).not.toBe(false)
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
            // Comme l'écran : « Réessayer » se fait sur place, c'est un bouton (ui-A3).
            errorAction: { label: retryLabel, role: 'button', onPress },
          })}
        />,
      )

      await fireEvent.press(screen.getByRole('button', { name: retryLabel }))

      expect(onPress).not.toHaveBeenCalled()
    })

    it('« Réessayer » retries once on a double tap', async () => {
      const onPress = jest.fn()
      await renderWithProviders(
        <CommentComposer
          {...propsOf({
            value: 'Merci',
            error,
            errorAction: { label: retryLabel, role: 'button', onPress },
          })}
        />,
      )
      const retry = () => screen.getByRole('button', { name: retryLabel })

      await fireEvent.press(retry())
      await fireEvent.press(retry())

      expect(onPress).toHaveBeenCalledTimes(1)
    })
  })

  // R6b (restes de R5b) : le champ reste modifiable pendant l'envoi ; ce qu'on y tape alors ne se perd
  // pas. Le champ est branché ici comme dans l'écran, sur le vrai brouillon (`useCommentDraft`) ;
  // seule l'écriture est simulée, et sa réponse attend que le test la donne.
  describe('while sending, wired to the draft as on the screen', () => {
    const pendingPost = () => {
      let finish: (ok: boolean) => void = () => {}
      const post = jest.fn(
        (_comment: { body: string }) =>
          new Promise<boolean>((resolve) => {
            finish = resolve
          }),
      )
      jest.mocked(usePostComment).mockReturnValue({
        post,
        pending: false,
        error: false,
        reason: undefined,
      } as unknown as ReturnType<typeof usePostComment>)
      /** L'API répond (`true` : publié) ; React redessine dans le même `act`. */
      const answer = (ok: boolean) =>
        act(async () => {
          finish(ok)
        })
      return { post, answer }
    }

    /** Le champ et le brouillon de l'écran (ProjectComments.tsx), sans le reste de la section. */
    function WithDraft() {
      const draft = useCommentDraft('p1')
      // Les autres props ne changent pas d'un rendu à l'autre (la `ref` du champ surtout).
      const [rest] = useState(() => propsOf())
      return (
        <CommentComposer
          {...rest}
          value={draft.text}
          onChangeText={draft.setText}
          onSend={() => void draft.send()}
          pending={draft.sending}
        />
      )
    }

    const sendButton = () => screen.getByRole('button', { name: /^Envoyer( le commentaire)?$/ })
    const typed = () => String(field().props.value ?? '')

    beforeEach(() => {
      jest.mocked(useEditComment).mockReturnValue({
        edit: jest.fn().mockResolvedValue(true),
        pending: false,
        error: false,
        reason: undefined,
      } as unknown as ReturnType<typeof useEditComment>)
    })

    it('keeps what is typed while sending, and clears only the sent text', async () => {
      const { post, answer } = pendingPost()
      await renderWithProviders(<WithDraft />)
      await fireEvent.changeText(field(), 'Bravo !')
      await fireEvent.press(sendButton())
      expect(post).toHaveBeenCalledWith({ body: 'Bravo !' })

      // Pendant l'envoi, le membre écrit la suite : le champ la prend.
      expect(field().props.editable).not.toBe(false)
      await fireEvent.changeText(field(), 'Bravo ! Je teste ce soir.')
      expect(typed()).toBe('Bravo ! Je teste ce soir.')

      await answer(true)

      // Publié : « Bravo ! » quitte le champ, la suite y reste (le blanc qui la séparait, au choix).
      expect(typed().trimStart()).toBe('Je teste ce soir.')
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('keeps a text rewritten while sending once the sent one is published', async () => {
      const { answer } = pendingPost()
      await renderWithProviders(<WithDraft />)
      await fireEvent.changeText(field(), 'Bravo !')
      await fireEvent.press(sendButton())

      // Le membre a effacé le texte parti et en écrit un autre : rien de lui n'est parti.
      await fireEvent.changeText(field(), 'Et en anglais ?')
      await answer(true)

      expect(typed()).toBe('Et en anglais ?')
    })

    it('keeps the whole text, what was typed meanwhile included, when the sending fails', async () => {
      const { answer } = pendingPost()
      await renderWithProviders(<WithDraft />)
      await fireEvent.changeText(field(), 'Bravo !')
      await fireEvent.press(sendButton())

      expect(field().props.editable).not.toBe(false)
      await fireEvent.changeText(field(), 'Bravo ! Je teste ce soir.')
      await answer(false)

      expect(typed()).toBe('Bravo ! Je teste ce soir.')
    })

    it('sends once on a double tap, the field staying editable', async () => {
      const { post, answer } = pendingPost()
      await renderWithProviders(<WithDraft />)
      await fireEvent.changeText(field(), 'Bravo !')

      await fireEvent.press(sendButton())
      await fireEvent.press(sendButton())

      expect(post).toHaveBeenCalledTimes(1)
      expect(field().props.editable).not.toBe(false)
      await answer(true)
      expect(post).toHaveBeenCalledTimes(1)
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
