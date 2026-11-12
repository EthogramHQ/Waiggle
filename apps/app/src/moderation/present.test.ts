// Tests de `viewHref` : où mène « Voir » dans la file de modération. Un appel ou un message du coin
// des testeurs mène au coin (R7b, le fil est privé), le reste comme avant.
import { viewHref } from './present'

const projectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
const uuid = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

describe('viewHref', () => {
  it('leads a call to the « Appels » tab of the testers corner, not to the project page', () => {
    expect(viewHref({ kind: 'call', id: uuid }, projectId)).toEqual({
      pathname: '/projects/[id]/testers',
      params: { id: projectId, tab: 'calls' },
    })
  })

  it('leads a message to the « Retours » tab of the testers corner, not to the project page', () => {
    expect(viewHref({ kind: 'message', id: uuid }, projectId)).toEqual({
      pathname: '/projects/[id]/testers',
      params: { id: projectId, tab: 'feedback' },
    })
  })

  it('still leads a comment to its project, and a member to the member page', () => {
    expect(viewHref({ kind: 'comment', id: uuid }, projectId)).toEqual({
      pathname: '/projects/[id]',
      params: { id: projectId },
    })
    expect(viewHref({ kind: 'member', id: 'u7' }, null)).toEqual({
      pathname: '/members/[id]',
      params: { id: 'u7' },
    })
  })
})
