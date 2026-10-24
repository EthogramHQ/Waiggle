// Les commentaires et les blocages (tranche 7b), au-delà des cas de comments.test.ts : les liens
// des mentions d'un membre bloqué, une mention gardée à la modification, et la réponse refusée
// même à l'auteur du projet. Léa publie ; Max et Zoé commentent.
import { CommentPage, CommentReply } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string
let max: string
let zoe: string
let maxId: string
let zoeId: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge d'une seconde : deux gestes n'ont jamais la même date. */
const later = () => vi.setSystemTime(Date.now() + 1000)

const readComments = async (projectId: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/comments`, cookie)
  expect(res.status).toBe(200)
  return CommentPage.parse(await res.json()).items
}

describe('mentions and blocks', () => {
  it('gives no link to a member blocked with the reader, and keeps it for the others', async () => {
    const project = await act.publish(lea, 'Météo')
    const { handle: maxHandle } = await act.me(max)
    later()
    await act.comment(project.id, lea, `Merci @${maxHandle}`)
    later()
    await act.block(maxId, zoe)

    const [forZoe] = await readComments(project.id, zoe)
    expect(forZoe).toMatchObject({ body: `Merci @${maxHandle}`, mentions: [] })
    expect(JSON.stringify(forZoe)).not.toContain(maxId)
    const [forLea] = await readComments(project.id, lea)
    expect(forLea?.mentions).toEqual([{ handle: maxHandle, memberId: maxId }])
  })

  // Règle 2 : la mention écrite avant le blocage reste en base, et une modification ne la retire
  // pas (sinon modifier son texte cacherait le commentaire à la personne mentionnée).
  it('keeps, after an edit, the mention of a member who blocked the author since', async () => {
    const project = await act.publish(lea, 'Météo')
    const { handle: zoeHandle } = await act.me(zoe)
    later()
    const written = await act.comment(project.id, max, `Bonjour @${zoeHandle}`)
    later()
    await act.block(maxId, zoe) // Zoé bloque Max après avoir été mentionnée
    later()

    const res = await act.send('PATCH', `/v1/projects/${project.id}/comments/${written.id}`, max, {
      body: `Bonjour encore @${zoeHandle}`,
    })
    expect(res.status).toBe(200)
    // Pas de lien dans la réponse : rien ne trahit le blocage.
    expect(CommentReply.parse(await res.json()).mentions).toEqual([])
    // Mais la mention reste : Zoé ne lit pas le commentaire (c'est elle qui a bloqué), Léa voit
    // toujours le lien.
    const [forLea] = await readComments(project.id, lea)
    expect(forLea?.mentions).toEqual([{ handle: zoeHandle, memberId: zoeId }])
  })
})

describe('replying and blocks', () => {
  it('refuses a reply to the other one even to the author of the project, who reads it', async () => {
    const project = await act.publish(lea, 'Météo')
    later()
    const root = await act.comment(project.id, max, 'Un commentaire chez Léa')
    later()
    await act.block(maxId, lea)

    expect((await readComments(project.id, lea)).map((c) => c.body)).toEqual([
      'Un commentaire chez Léa',
    ])
    const res = await act.send('POST', `/v1/projects/${project.id}/comments`, lea, {
      body: 'Une réponse',
      replyTo: root.id,
    })
    expect(res.status).toBe(404)
    // Témoin : Zoé y répond.
    const witness = await act.send('POST', `/v1/projects/${project.id}/comments`, zoe, {
      body: 'Une réponse de Zoé',
      replyTo: root.id,
    })
    expect(witness.status).toBe(201)
  })
})
