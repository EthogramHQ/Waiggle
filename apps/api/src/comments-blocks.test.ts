// Les commentaires et les blocages (tranche 7b), au-delà des cas de comments.test.ts : les liens
// des mentions d'un membre bloqué, une mention gardée à la modification, et la réponse refusée
// même à l'auteur du projet. Léa publie ; Max et Zoé commentent.
import { CommentPage, CommentReply, NotificationPage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mentionEmails } from './jobs/mention-emails'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'

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

// « Une fois mentionné, lisible tant que le commentaire existe » (décision du 25/10/2026, relecture
// juridique) : retirer « @zoe » en modifiant ne cache pas le commentaire à Zoé (règle 2), mais ce
// n'est plus une mention : ni lien, ni notification, ni e-mail.
describe('a mention taken out by an edit', () => {
  const edit = async (projectId: string, commentId: string, body: string) => {
    later()
    const res = await act.send('PATCH', `/v1/projects/${projectId}/comments/${commentId}`, max, {
      body,
    })
    expect(res.status).toBe(200)
    return CommentReply.parse(await res.json())
  }

  /** Les notifications de Zoé pour une mention. */
  const zoeMentions = async () => {
    const res = await act.send('GET', '/v1/notifications', zoe)
    expect(res.status).toBe(200)
    return NotificationPage.parse(await res.json()).items.filter(
      (n) => n.kind === 'comment' && n.reason === 'mention',
    )
  }

  /**
   * La tâche des e-mails de mentions, vingt minutes plus tard (elle attend un quart d'heure) : les
   * e-mails qu'elle envoie à Zoé (pas ceux d'avant, comme la confirmation de son adresse).
   */
  const runMentionEmails = async () => {
    const before = ctx.mailer.sent.length
    vi.setSystemTime(Date.now() + 20 * 60 * 1000)
    await mentionEmails(
      {
        db: ctx.db,
        mailer: ctx.mailer,
        appUrl: TEST_APP_URL,
        apiUrl: TEST_API_URL,
        secret: TEST_AUTH_SECRET,
      },
      new Date(),
    )
    return ctx.mailer.sent.slice(before).filter((email) => email.to === 'zoe@example.com')
  }

  it('leaves the comment readable and reportable by the member once named, when its author blocked her', async () => {
    const project = await act.publish(lea, 'Météo')
    const { handle: zoeHandle } = await act.me(zoe)
    later()
    const written = await act.comment(project.id, max, `Bonjour @${zoeHandle}`)
    later()
    const other = await act.comment(project.id, max, 'Un autre, sans mention')
    later()
    await act.block(zoeId, max) // Max bloque Zoé, puis retire « @zoe »
    await edit(project.id, written.id, 'Bonjour')

    // Zoé lit encore le commentaire qui la nommait (avec le nom de Max), pas l'autre.
    const items = await readComments(project.id, zoe)
    expect(items.map((item) => item.id)).toEqual([written.id])
    expect(items[0]).toMatchObject({ body: 'Bonjour', state: 'visible', mentions: [] })
    expect(items[0]?.author?.name).toBe('Max')
    // Et peut le signaler ; l'autre reste introuvable pour elle.
    await act.report(zoe, { kind: 'comment', id: written.id })
    const refused = await act.send('POST', '/v1/reports', zoe, {
      target: { kind: 'comment', id: other.id },
      reason: 'other',
    })
    expect(refused.status).toBe(404)
  })

  it('gives no link, no notification and no email, and comes back once written again', async () => {
    await act.setPreferences(zoe, { mentionEmails: true })
    const project = await act.publish(lea, 'Météo')
    const { handle: zoeHandle } = await act.me(zoe)
    later()
    const written = await act.comment(project.id, max, `Merci @${zoeHandle}`)
    expect(await zoeMentions()).toHaveLength(1)

    expect((await edit(project.id, written.id, 'Merci')).mentions).toEqual([])
    expect((await readComments(project.id, lea))[0]?.mentions).toEqual([])
    expect(await zoeMentions()).toEqual([])
    expect(await runMentionEmails()).toEqual([])

    // Réécrite, la mention revient, datée de cette modification, comme une mention nouvelle.
    const again = await edit(project.id, written.id, `Merci encore @${zoeHandle}`)
    expect(again.mentions).toEqual([{ handle: zoeHandle, memberId: zoeId }])
    expect((await readComments(project.id, lea))[0]?.mentions).toEqual(again.mentions)
    expect((await zoeMentions()).map((n) => n.at)).toEqual([again.editedAt])
    expect(await runMentionEmails()).toHaveLength(1)
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
