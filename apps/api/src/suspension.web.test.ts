// Tests d'intégration de R12 : ce qu'un auteur suspendu peut faire d'un projet « Public » (`web`).
// Décision de la session sur Q6 : il peut le rendre moins visible (« Membres », une ruche, « Privé »),
// jamais plus ; depuis un autre projet, seul « Privé » reste permis (R9, décision L6). Les droits
// sur le projet d'un autre ne changent pas.
import { ErrorResponse } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { seedHive } from './testing/hive-seeds'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let max: string
let louis: string
let inesId: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const patch = (cookie: string, id: string, body: object) => {
  later()
  return act.send('PATCH', `/v1/projects/${id}`, cookie, body)
}

const visibilityOf = async (id: string) =>
  (
    await ctx.db
      .select({ visibility: schema.project.visibility })
      .from(schema.project)
      .where(eq(schema.project.id, id))
  )[0]?.visibility

const expectSuspended = async (res: Response) => {
  expect(res.status).toBe(403)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe('suspended')
}

it('lets a suspended author make a public project visible to members or to a hive only, never the reverse', async () => {
  const hiveId = await seedHive(ctx.db, { name: 'Famille', animatorId: inesId })
  later()
  const forMembers = await act.publish(ines, 'Pour les membres')
  later()
  const toMembers = await ctx.webProject(ines)
  later()
  const toHive = await ctx.webProject(ines)
  await world.suspend(louis, inesId)

  // Depuis « Public » : « Membres », puis une ruche, permis ; rien d'autre dans la même demande.
  await expectSuspended(await patch(ines, toMembers, { visibility: 'public', title: 'Autre' }))
  expect((await patch(ines, toMembers, { visibility: 'public' })).status).toBe(200)
  expect(await visibilityOf(toMembers)).toBe('public')
  expect((await patch(ines, toHive, { visibility: 'hive', hiveId })).status).toBe(200)
  expect(await visibilityOf(toHive)).toBe('hive')

  // Jamais plus visible : « Membres » ne monte ni vers une ruche… ni vers « Public ».
  await expectSuspended(await patch(ines, toMembers, { visibility: 'hive', hiveId }))
  await expectSuspended(await patch(ines, toHive, { visibility: 'public' }))
  await expectSuspended(await patch(ines, forMembers.id, { visibility: 'web' }))
  expect(await visibilityOf(toMembers)).toBe('public')
  expect(await visibilityOf(toHive)).toBe('hive')
  expect(await visibilityOf(forMembers.id)).toBe('public')

  // Le projet « Public » d'un autre membre : la garde des suspendus ne lit que les siens.
  later()
  const ofMax = await ctx.webProject(max)
  await expectSuspended(await patch(ines, ofMax, { visibility: 'public' }))
  expect(await visibilityOf(ofMax)).toBe('web')
})
