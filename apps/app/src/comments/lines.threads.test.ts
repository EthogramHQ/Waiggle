// Les lignes de l'aperçu rangées par fil (R5b, des-A10) : chaque racine avec ses réponses, pour que
// l'aperçu dessine le même coude que la feuille ; des réponses sans leur racine restent seules.
import { commentOf, leaReply, replyOf, zoeReply } from '../testing/comments'
import { previewLines, previewThreads } from './lines'

describe('previewThreads', () => {
  it('groups a root with its replies, in order', () => {
    const root = commentOf({ id: 'r1', body: 'Super', replies: [zoeReply, leaReply] })

    const [thread, ...others] = previewThreads(previewLines([root], 5))

    expect(others).toHaveLength(0)
    expect(thread?.root?.comment.id).toBe('r1')
    expect(thread?.replies.map((line) => line.comment.id)).toEqual([zoeReply.id, leaReply.id])
  })

  it('keeps the replies of a root that is not in the preview alone, without a root', () => {
    const hidden = commentOf({
      id: 'r2',
      body: '',
      state: 'hidden',
      author: null,
      replies: [zoeReply],
    })

    const [thread] = previewThreads(previewLines([hidden], 5))

    expect(thread?.root).toBeNull()
    expect(thread?.replies.map((line) => line.comment.id)).toEqual([zoeReply.id])
  })

  it('cuts a thread where the preview stops', () => {
    const root = commentOf({
      id: 'r3',
      body: 'Super',
      replies: [zoeReply, replyOf({ id: 'x', body: 'Autre' })],
    })

    const [thread] = previewThreads(previewLines([root], 2))

    expect(thread?.replies).toHaveLength(1)
  })
})
