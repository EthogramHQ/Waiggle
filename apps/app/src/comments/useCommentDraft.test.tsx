// Tests du brouillon d'un commentaire (R5b) : ce que le membre écrit dans le champ du bas de la
// feuille, et ce que ce texte devient selon le geste (un nouveau fil, une réponse, une
// modification). Le hook `useCommentDraft` garde l'état au-dessus de la feuille : fermer la feuille
// garde le texte, et il ne quitte jamais la mémoire de l'appli (rien dans le stockage de
// l'appareil). Il envoie par les vrais hooks d'écriture (`usePostComment`, `useEditComment`) : seul
// le client réseau est remplacé, pour lire les demandes envoyées et choisir les réponses.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Comment, CommentPage, CommentReply } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { type ReactNode, useState } from 'react'
import { Pressable, Text, TextInput } from 'react-native'
import { request } from '../api/client'
import { leaReply, maxComment, replyOf, zoeComment, zoeReply } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { useCommentDraft } from './useCommentDraft'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Le coffre de l'appareil (expo-secure-store) : de fausses fonctions, pour vérifier que le brouillon
// n'y entre jamais (le stockage simple, AsyncStorage, est déjà simulé par jest.setup.ts).
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  setItem: jest.fn(),
  getItem: jest.fn(),
}))

const { id } = recipesProject
const commentsPath = `/v1/projects/${id}/comments`

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Le hook, rendu dans un vrai cache de React Query (celui que lisent les hooks d'écriture). */
const renderDraft = () => renderHook(() => useCommentDraft(id), { wrapper })

/** La demande numéro `index` envoyée par `request` : son adresse, sa méthode et son corps JSON. */
const sent = (index = 0) => {
  const call = jest.mocked(request).mock.calls[index]
  if (!call) throw new Error(`no request number ${index}`)
  const [path, init] = call
  return { path, method: init?.method, body: JSON.parse(String(init?.body)) }
}

/** Le commentaire que l'API rend après un envoi réussi (le contenu importe peu ici). */
const published = (body: string): Comment => ({ ...zoeComment, body, isMine: true })

/** Une réponse que le test laisse en attente, puis termine à la main (double envoi, nouvel essai). */
const held = () => {
  let finish: (value: unknown) => void = () => undefined
  const answer = new Promise((resolve) => {
    finish = resolve
  })
  return { answer, finish }
}

/** Une réponse de Malik, lue malgré un blocage : l'API ne donne ni son pseudo ni sa photo (jur-P5). */
const malikReply: CommentReply = replyOf({
  id: '6e7f8091-a2b3-4cc4-9dd5-e6f708192a3b',
  author: { id: 'u7', name: 'Malik', handle: null, avatarUrl: null },
  body: 'Je passe par là.',
})

beforeEach(async () => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  // Le projet et ses commentaires déjà lus par la page : les hooks d'écriture les mettent à jour.
  client.setQueryData(['project', id], { ...recipesProject, commentCount: 4 })
  client.setQueryData<{ pages: CommentPage[]; pageParams: unknown[] }>(['comments', id], {
    pages: [{ items: [maxComment, zoeComment], nextCursor: null }],
    pageParams: [undefined],
  })
  jest.mocked(request).mockReset()
  await AsyncStorage.clear()
})

describe('a new comment', () => {
  it('starts as a new comment, with an empty text and nothing highlighted', async () => {
    const { result } = await renderDraft()

    expect(result.current.mode).toEqual({ kind: 'new' })
    expect(result.current.text).toBe('')
    expect(result.current.highlightedId).toBeNull()
    expect(result.current.sending).toBe(false)
    expect(result.current.error).toBeFalsy()
  })

  it('sends the text typed as a new thread, then empties the field', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: published('Bravo !') })
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Bravo !'))
    let done: boolean | undefined
    await act(async () => {
      done = await result.current.send()
    })

    expect(done).toBe(true)
    expect(sent()).toEqual({ path: commentsPath, method: 'POST', body: { body: 'Bravo !' } })
    expect(result.current.text).toBe('')
    expect(result.current.mode).toEqual({ kind: 'new' })
  })

  it('keeps the text and says the error when sending fails', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Bravo !'))
    let done: boolean | undefined
    await act(async () => {
      done = await result.current.send()
    })

    expect(done).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.text).toBe('Bravo !')
  })

  it('keeps the started text when the sheet closes, and gives it back when it opens again', async () => {
    // L'écran garde le brouillon au-dessus de la feuille : la feuille (ici, le champ) peut
    // disparaître et revenir, le texte reste tant que la page est là (scénario R5b).
    const Page = () => {
      const draft = useCommentDraft(id)
      const [open, setOpen] = useState(true)
      return (
        <>
          {open ? (
            <TextInput
              accessibilityLabel="Écrire un commentaire"
              value={draft.text}
              onChangeText={draft.setText}
            />
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setOpen((shown) => !shown)}>
            <Text>{open ? 'Fermer' : 'Ouvrir'}</Text>
          </Pressable>
        </>
      )
    }
    await render(<Page />, { wrapper })

    await fireEvent.changeText(screen.getByLabelText('Écrire un commentaire'), 'Pas fini')
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer' }))
    // Témoin : la feuille est bien fermée.
    expect(screen.queryByLabelText('Écrire un commentaire')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir' }))

    expect(screen.getByLabelText('Écrire un commentaire')).toHaveProp('value', 'Pas fini')
  })

  // Juridique (relecture du plan) : le brouillon reste dans l'état React, jamais dans le stockage
  // de l'appareil, où il survivrait à la page (et au compte, sur un appareil partagé).
  it('never writes the unsent comment to device storage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem')
    const mergeItem = jest.spyOn(AsyncStorage, 'mergeItem')
    const multiSet = jest.spyOn(AsyncStorage, 'multiSet')
    const multiMerge = jest.spyOn(AsyncStorage, 'multiMerge')
    // Le stockage simulé garde les appels des tests précédents : on repart de zéro.
    for (const spy of [setItem, mergeItem, multiSet, multiMerge]) spy.mockClear()
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Brouillon secret'))
    await act(async () => result.current.startReply(maxComment, zoeReply))
    await act(async () => result.current.startEdit({ ...zoeComment, isMine: true }))
    await act(async () => result.current.cancel())

    // Témoin : le brouillon est bien gardé, en mémoire.
    expect(result.current.text).toContain('Brouillon secret')
    const written = JSON.stringify([
      setItem.mock.calls,
      mergeItem.mock.calls,
      multiSet.mock.calls,
      multiMerge.mock.calls,
      jest.mocked(SecureStore.setItemAsync).mock.calls,
      jest.mocked(SecureStore.setItem).mock.calls,
    ])
    expect(written).not.toContain('Brouillon secret')
  })
})

describe('replying', () => {
  it('replies in the thread of a root, highlights it, and adds no mention', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, maxComment))

    expect(result.current.mode).toEqual({ kind: 'reply', rootId: maxComment.id, name: 'Max' })
    expect(result.current.highlightedId).toBe(maxComment.id)
    expect(result.current.text).toBe('')
  })

  it('replies under the reply of another member in the same thread, starting with their mention', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))

    expect(result.current.mode).toEqual({ kind: 'reply', rootId: maxComment.id, name: 'Zoé' })
    expect(result.current.highlightedId).toBe(zoeReply.id)
    expect(result.current.text).toBe('@zoe ')
  })

  it('adds no mention under my own reply', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, { ...leaReply, isMine: true }))

    expect(result.current.mode).toEqual({ kind: 'reply', rootId: maxComment.id, name: 'Léa' })
    expect(result.current.text).toBe('')
  })

  // jur-P5 (sécurité B1) : lu malgré un blocage, l'auteur n'a pas de pseudo (`handle: null`) ; la
  // réponse ne le devine pas et ne l'écrit pas.
  it('prefills no mention when replying under a comment read despite a block', async () => {
    const { result } = await renderDraft()

    await act(async () =>
      result.current.startReply({ ...maxComment, replies: [malikReply] }, malikReply),
    )

    expect(result.current.mode).toEqual({ kind: 'reply', rootId: maxComment.id, name: 'Malik' })
    expect(result.current.text).toBe('')
    expect(result.current.text).not.toContain('@')
  })

  // ui-I5 : un texte commencé avant « Répondre » n'est jamais perdu.
  it('startReply keeps a started text and adds the mention in front', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Génial'))
    await act(async () => result.current.startReply(maxComment, zoeReply))

    expect(result.current.text).toBe('@zoe Génial')
  })

  it('sends a reply to the root of the thread, then comes back to a new comment', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: published('@zoe Merci') })
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))
    await act(async () => result.current.setText('@zoe Merci'))
    await act(async () => {
      await result.current.send()
    })

    expect(sent()).toEqual({
      path: commentsPath,
      method: 'POST',
      body: { body: '@zoe Merci', replyTo: maxComment.id },
    })
    expect(result.current.mode).toEqual({ kind: 'new' })
    expect(result.current.highlightedId).toBeNull()
    expect(result.current.text).toBe('')
  })

  it('cancel() of a reply comes back to a new comment and highlights nothing', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))
    // Témoin : la réponse est bien commencée, et son commentaire surligné.
    expect(result.current.mode.kind).toBe('reply')
    expect(result.current.highlightedId).toBe(zoeReply.id)
    await act(async () => result.current.cancel())

    expect(result.current.mode).toEqual({ kind: 'new' })
    expect(result.current.highlightedId).toBeNull()
  })
})

describe('editing', () => {
  const mine: CommentReply = { ...zoeReply, isMine: true }

  it('puts the text of the comment in the field and highlights it', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startEdit(mine))

    expect(result.current.mode).toEqual({ kind: 'edit', commentId: mine.id })
    expect(result.current.text).toBe(mine.body)
    expect(result.current.highlightedId).toBe(mine.id)
  })

  it('sends the new text as a change of this comment, then comes back to a new comment', async () => {
    jest
      .mocked(request)
      .mockResolvedValue({ ok: true, data: { ...mine, body: 'Moi aussi, vite !' } })
    const { result } = await renderDraft()

    await act(async () => result.current.startEdit(mine))
    await act(async () => result.current.setText('Moi aussi, vite !'))
    let done: boolean | undefined
    await act(async () => {
      done = await result.current.send()
    })

    expect(done).toBe(true)
    expect(sent()).toEqual({
      path: `${commentsPath}/${mine.id}`,
      method: 'PATCH',
      body: { body: 'Moi aussi, vite !' },
    })
    expect(result.current.mode).toEqual({ kind: 'new' })
    expect(result.current.highlightedId).toBeNull()
  })

  it('cancel() of an edit gives back the text from before the edit', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Début de mon idée'))
    await act(async () => result.current.startEdit(mine))
    await act(async () => result.current.setText('Moi aussi, changé'))
    await act(async () => result.current.cancel())

    expect(result.current.text).toBe('Début de mon idée')
    expect(result.current.mode).toEqual({ kind: 'new' })
    expect(result.current.highlightedId).toBeNull()
  })

  // ui-I5 : « Répondre » pendant une modification quitte la modification sans garder son texte.
  it('startReply during an edit first gives back the text from before the edit', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Début'))
    await act(async () => result.current.startEdit(mine))
    await act(async () => result.current.startReply(maxComment, zoeReply))

    expect(result.current.mode).toEqual({ kind: 'reply', rootId: maxComment.id, name: 'Zoé' })
    expect(result.current.text).toBe('@zoe Début')
    expect(result.current.highlightedId).toBe(zoeReply.id)
  })
})

describe('the guards of sending', () => {
  // ui-I5 : la garde est une `ref` : deux appels dans le même instant (double tape, Entrée et
  // toucher), avant tout nouveau rendu, n'envoient qu'une fois.
  it('two send() calls in the same tick post once', async () => {
    const { answer, finish } = held()
    jest.mocked(request).mockReturnValue(answer as ReturnType<typeof request>)
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Bravo !'))
    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    await act(async () => {
      first = result.current.send()
      second = result.current.send()
    })

    expect(request).toHaveBeenCalledTimes(1)
    // Pendant l'envoi, le champ est annoncé occupé.
    expect(result.current.sending).toBe(true)
    await act(async () => {
      finish({ ok: true, data: published('Bravo !') })
      await Promise.all([first, second])
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.current.sending).toBe(false)
  })

  // ui-I5 : « Réessayer » ne fait pas clignoter l'erreur (elle disparaîtrait puis reviendrait, et
  // le focus posé sur « Réessayer » se perdrait) : elle reste jusqu'à la réponse.
  it('the error stays displayed during a retry until the answer', async () => {
    jest.mocked(request).mockResolvedValueOnce({ ok: false, error: 'network' })
    const { result } = await renderDraft()

    await act(async () => result.current.setText('Bravo !'))
    await act(async () => {
      await result.current.send()
    })
    // Témoin : le premier envoi a bien échoué.
    expect(result.current.error).toBeTruthy()

    const { answer, finish } = held()
    jest.mocked(request).mockReturnValueOnce(answer as ReturnType<typeof request>)
    let retried: unknown
    await act(async () => {
      retried = result.current.retry()
    })
    expect(result.current.sending).toBe(true)
    expect(result.current.error).toBeTruthy()

    await act(async () => {
      finish({ ok: true, data: published('Bravo !') })
      await retried
    })
    expect(result.current.error).toBeFalsy()
    // Le nouvel essai renvoie le même commentaire.
    expect(request).toHaveBeenCalledTimes(2)
    expect(sent(1)).toEqual(sent(0))
    expect(result.current.text).toBe('')
  })
})
