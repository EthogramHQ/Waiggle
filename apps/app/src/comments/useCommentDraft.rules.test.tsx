// Les règles du brouillon validées par Louis le 5/11/2026, que les autres fichiers de test ne disent pas :
// annuler une réponse garde le texte tapé et retire la mention préremplie ; répondre à deux
// personnes de suite remplace la première mention si elle est intacte, sinon la nouvelle s'ajoute.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { leaReply, maxComment, zoeReply } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { useCommentDraft } from './useCommentDraft'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)
const renderDraft = () => renderHook(() => useCommentDraft(recipesProject.id), { wrapper })

// Léa a un pseudo ('lea') dans la fabrique ; celle de Zoé aussi : deux personnes à viser.
const leaOther = { ...leaReply, isMine: false }

describe('cancel() of a reply', () => {
  it('keeps the text typed and removes the mention it prefilled', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))
    await act(async () => result.current.setText('@zoe Super idée'))
    await act(async () => result.current.cancel())

    expect(result.current.text).toBe('Super idée')
    expect(result.current.mode).toEqual({ kind: 'new' })
  })

  it('keeps a mention the member changed: the text is theirs', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))
    await act(async () => result.current.setText('Salut @zoe'))
    await act(async () => result.current.cancel())

    expect(result.current.text).toBe('Salut @zoe')
  })
})

describe('two replies in a row', () => {
  it('replaces the first mention while it is still in front and intact', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))
    await act(async () => result.current.setText('@zoe Merci'))
    await act(async () => result.current.startReply(maxComment, leaOther))

    expect(result.current.text).toBe('@lea Merci')
    // Le bandeau suit la dernière personne visée.
    expect(result.current.mode).toEqual({ kind: 'reply', rootId: maxComment.id, name: 'Léa' })
    expect(result.current.highlightedId).toBe(leaOther.id)
  })

  it('puts the new mention in front when the first was changed', async () => {
    const { result } = await renderDraft()

    await act(async () => result.current.startReply(maxComment, zoeReply))
    await act(async () => result.current.setText('Merci @zoe'))
    await act(async () => result.current.startReply(maxComment, leaOther))

    expect(result.current.text).toBe('@lea Merci @zoe')
  })
})
