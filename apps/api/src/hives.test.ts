// Tests d'intégration de R10 « Ruches », le cœur : mes ruches, créer, la page d'une ruche, son
// actualité, ses projets, ses membres, l'animateur (renommer, épingler, qui invite, confier,
// retirer, supprimer), quitter. Scénario : docs/scenarios/refonte.md, « R10 » ; contrat :
// packages/contracts/src/hives.ts. Les invitations sont dans hives.invitations.test.ts, les limites
// dans hives.limits.test.ts.
//
// Les membres : Inès Haddad (qui crée « Famille » et l'anime), Léa et Max (qu'elle y fait entrer),
// Nora (une autre membre de Waiggle, hors de la ruche), Zoé (invitée, qui n'a pas encore accepté),
// Louis (l'administrateur, pour retirer une photo de profil).
//
// Une ruche qu'on n'a pas le droit de voir répond le même 404 qu'une ruche qui n'existe pas : le test
// compare le statut et le corps des deux réponses, pour la même personne (le message dépend de sa
// langue). Une route absente répond aussi 404 : chaque test commence donc par créer la ruche, ce qui
// échoue tant que la route n'existe pas (le témoin de la charte, R4).
import { readFileSync } from 'node:fs'
import {
  ErrorResponse,
  HIVE_ICONS,
  HiveActivityPage,
  HivePage,
  HiveProjectsPage,
  Project,
} from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'
import { avatarForm, jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let ines: TestMember
let lea: TestMember
let max: TestMember
let nora: TestMember
let zoe: TestMember

/** Un identifiant bien formé qui ne désigne aucune ruche, ni aucun projet. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const DAY = 24 * 60 * 60 * 1000

/** Avance la fausse horloge (une seconde par défaut) : chaque geste a sa propre date. */
const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API (la limite de débit garde la fonction Date.now
  // qu'elle trouve à ce moment-là).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès Haddad', '198.51.100.1')
  lea = await signedUpMember(ctx, act, 'Léa', '198.51.100.2')
  max = await signedUpMember(ctx, act, 'Max', '198.51.100.3')
  nora = await signedUpMember(ctx, act, 'Nora', '198.51.100.4')
  zoe = await signedUpMember(ctx, act, 'Zoé', '198.51.100.5')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Le statut et le corps d'une réponse, pour comparer deux refus mot pour mot. */
const answer = async (method: string, path: string, cookie: string | null, body?: unknown) => {
  const res = await act.send(method, path, cookie, body)
  return `${res.status} ${await res.text()}`
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** « Famille », animée par Inès, avec Léa et Max, entrés dans cet ordre. */
const family = async () => {
  later()
  const famille = await hives.create(ines.cookie)
  later()
  await hives.join(famille.id, ines.cookie, lea)
  later()
  await hives.join(famille.id, ines.cookie, max)
  return famille
}

const activityOf = async (hiveId: string, cookie: string, cursor?: string) => {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : ''
  const res = await act.send('GET', `/v1/hives/${hiveId}/activity${query}`, cookie)
  expect(res.status, `activity of ${hiveId}`).toBe(200)
  return HiveActivityPage.parse(await res.json())
}

const projectsOf = async (hiveId: string, cookie: string) => {
  const res = await act.send('GET', `/v1/hives/${hiveId}/projects`, cookie)
  expect(res.status, `projects of ${hiveId}`).toBe(200)
  return HiveProjectsPage.parse(await res.json())
}

const projectAs = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status, `project ${id}`).toBe(200)
  return Project.parse(await res.json())
}

// ─── Qui peut ouvrir une ruche ────────────────────────────────────────────────────────────────────

describe('who may open a hive', () => {
  it('is only for signed-in members', async () => {
    expect((await act.send('GET', '/v1/hives', null)).status).toBe(401)
    expect(
      (await act.send('POST', '/v1/hives', null, { name: 'Famille', icon: 'heart' })).status,
    ).toBe(401)
    // Témoin : avec une session, la même demande réussit (la route existe bien).
    expect((await hives.create(ines.cookie)).name).toBe('Famille')
  })

  it('answers the same 404 to a stranger, an invitee and a former member on every hive route', async () => {
    const famille = await family()
    // Max quitte la ruche (ancien membre) ; Zoé est invitée, sans avoir accepté ; Nora n'a rien.
    later()
    await hives.removeMember(famille.id, max.cookie, max.id)
    later()
    await hives.invite(famille.id, ines.cookie, zoe.id)
    // Chaque route d'une ruche, avec un corps valable : seul le droit d'entrer peut la refuser.
    const routes = (id: string): [string, string, unknown?][] => [
      ['GET', `/v1/hives/${id}`],
      ['PATCH', `/v1/hives/${id}`, { name: 'Autre nom' }],
      ['DELETE', `/v1/hives/${id}`],
      ['GET', `/v1/hives/${id}/activity`],
      ['GET', `/v1/hives/${id}/projects`],
      ['GET', `/v1/hives/${id}/members`],
      ['DELETE', `/v1/hives/${id}/members/${encodeURIComponent(lea.id)}`],
      ['POST', `/v1/hives/${id}/animator`, { userId: lea.id }],
      ['GET', `/v1/hives/${id}/invitable?q=lea`],
      ['POST', `/v1/hives/${id}/invitations`, { userId: nora.id }],
    ]
    const known = routes(famille.id)
    const absent = routes(UNKNOWN)

    const wrong: string[] = []
    for (const [who, outsider] of [
      ['stranger', nora],
      ['invitee', zoe],
      ['former member', max],
    ] as const) {
      for (const [index, [method, path, body]] of known.entries()) {
        const [, absentPath] = absent[index] ?? []
        const got = await answer(method, path, outsider.cookie, body)
        const unknown = await answer(method, absentPath ?? '', outsider.cookie, body)
        if (!got.startsWith('404 ') || got !== unknown) {
          wrong.push(
            `${who}, ${method} ${path}: ${got.slice(0, 80)} / unknown: ${unknown.slice(0, 80)}`,
          )
        }
      }
    }
    expect(wrong.join('\n')).toBe('')
    // Un identifiant mal formé répond le même 404, sans lire la base.
    expect(await answer('GET', '/v1/hives/not-a-uuid', nora.cookie)).toBe(
      await answer('GET', `/v1/hives/${UNKNOWN}`, nora.cookie),
    )
    // Témoins : rien n'a changé (ni nom, ni membre retiré, ni animation, ni invitation), et Léa,
    // membre, ouvre bien la page.
    const page = await hives.page(famille.id, lea.cookie)
    expect(page.summary.name).toBe('Famille')
    expect(page.summary.memberCount).toBe(2)
    expect(page.summary.animator?.id).toBe(ines.id)
    expect(page.pendingInvitations).toBe(1)
  })
})

// ─── Mes ruches ───────────────────────────────────────────────────────────────────────────────────

describe('my hives', () => {
  it('lists nothing to a member without any hive or invitation', async () => {
    expect(await hives.mine(nora.cookie)).toEqual({ hives: [], invitations: [], createdCount: 0 })
  })

  it('lists my hives with their members, their animator and my role', async () => {
    const famille = await family()

    const mine = await hives.mine(lea.cookie)
    expect(mine.hives).toEqual([
      expect.objectContaining({
        id: famille.id,
        name: 'Famille',
        icon: 'house-line',
        memberCount: 3,
        animator: { id: ines.id, name: 'Inès Haddad' },
        role: 'member',
      }),
    ])
    expect(mine.createdCount).toBe(0)
    expect((await hives.mine(ines.cookie)).hives[0]?.role).toBe('animator')
    expect((await hives.mine(ines.cookie)).createdCount).toBe(1)
  })

  it('orders hives from the most recently active to the calmest', async () => {
    const famille = await family()
    later()
    const amis = await hives.create(ines.cookie, 'Amis du jeudi', 'coffee')
    later()
    await hives.join(amis.id, ines.cookie, lea)
    // Une publication dans Famille, la plus ancienne des deux ruches, la fait passer devant.
    later()
    await hives.publishReserved(ines.cookie, 'Le plan de table', famille.id)

    expect((await hives.mine(lea.cookie)).hives.map((one) => one.id)).toEqual([famille.id, amis.id])
  })

  it('counts the news of a hive since the last visit of its page', async () => {
    const famille = await family()
    later()
    await hives.page(famille.id, lea.cookie)
    later()
    await hives.publishReserved(ines.cookie, 'Le plan de table', famille.id)
    later()
    await hives.publishReserved(max.cookie, 'Biscotte au parc', famille.id)

    expect((await hives.mine(lea.cookie)).hives[0]?.news).toBe(2)
    // Ouvrir la page pose la date de visite : plus rien de neuf.
    later()
    await hives.page(famille.id, lea.cookie)
    expect((await hives.mine(lea.cookie)).hives[0]?.news).toBe(0)
  })
})

// ─── Créer une ruche ──────────────────────────────────────────────────────────────────────────────

describe('creating a hive', () => {
  it('makes its creator the animator and only member', async () => {
    const created = await hives.create(ines.cookie, 'Famille', 'heart')

    expect(created).toEqual(
      expect.objectContaining({
        name: 'Famille',
        icon: 'heart',
        memberCount: 1,
        animator: { id: ines.id, name: 'Inès Haddad' },
        news: 0,
        role: 'animator',
      }),
    )
    const page = await hives.page(created.id, ines.cookie)
    expect(page).toEqual(
      expect.objectContaining({
        invite: 'allowed',
        invitePolicy: 'members',
        pendingInvitations: 0,
        pinned: null,
        seekingTesters: [],
        projectCount: 0,
        // Seule, elle supprimerait la ruche en la quittant : personne ne prendrait l'animation.
        successor: null,
      }),
    )
    expect(await hives.members(created.id, ines.cookie)).toEqual([
      expect.objectContaining({ role: 'animator', isMe: true, reduced: false }),
    ])
  })

  it('trims the name, and refuses an empty or blank name, a long one, an unknown icon or another field', async () => {
    expect((await hives.create(ines.cookie, '  Famille  ')).name).toBe('Famille')

    for (const body of [
      { name: '', icon: 'heart' },
      { name: '    ', icon: 'heart' },
      { name: 'x'.repeat(41), icon: 'heart' },
      { name: 'Famille', icon: 'skull' },
      { name: 'Famille', icon: 'heart', animatorId: lea.id },
    ]) {
      await expectError(await act.send('POST', '/v1/hives', ines.cookie, body), 400, 'validation')
    }
    expect((await hives.mine(ines.cookie)).createdCount).toBe(1)
  })

  it('allows in the database exactly the icons of the contract', async () => {
    // La liste de la contrainte est écrite en dur dans le schéma (la base ne lit pas le contrat) :
    // les deux listes doivent rester les mêmes, dans le même ordre.
    // Les lignes d'un `execute` brut passent par Zod (leur type n'est pas connu).
    const { rows } = z
      .object({ rows: z.array(z.object({ definition: z.string() })) })
      .parse(
        await ctx.db.execute(
          sql`select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'hive_icon_check'`,
        ),
      )
    const definition = rows[0]?.definition ?? ''
    const inDatabase = [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(inDatabase).toEqual([...HIVE_ICONS])
    // Et la migration, telle qu'elle partira en production.
    const migration = readFileSync(
      new URL('../../../packages/db/migrations/0023_hives_r10.sql', import.meta.url),
      'utf8',
    )
    const check = migration.match(/"hive_icon_check" CHECK \(([^\n]*)\)\)/)?.[1] ?? ''
    expect([...check.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([...HIVE_ICONS])
  })
})

// ─── La page d'une ruche ──────────────────────────────────────────────────────────────────────────

describe('the page of a hive', () => {
  it('counts the projects reserved to the hive, and only those', async () => {
    const famille = await family()
    later()
    const amis = await hives.create(lea.cookie, 'Amis du jeudi', 'coffee')
    later()
    await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id)
    later()
    await hives.publishReserved(ines.cookie, 'Biscotte au parc', famille.id)
    later()
    await act.publish(lea.cookie, 'Carnet secret', { visibility: 'private' })
    later()
    await act.publish(lea.cookie, 'Ouvert à tous')
    later()
    await hives.publishReserved(lea.cookie, 'Jeu du jeudi', amis.id)

    expect((await hives.page(famille.id, max.cookie)).projectCount).toBe(2)
  })

  it('shows under looking for testers only the testable projects of members that the whole hive can see', async () => {
    const famille = await family()
    later()
    const amis = await hives.create(lea.cookie, 'Amis du jeudi', 'coffee')
    const testable = { status: 'testable', demoUrl: 'https://essai.example.com/' }
    later()
    const plan = await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id, testable)
    later()
    const open = await act.publish(max.cookie, 'Biscotte au parc', testable)
    later()
    await hives.publishReserved(lea.cookie, 'Jeu du jeudi', amis.id, testable)
    later()
    await act.publish(lea.cookie, 'Carnet secret', { visibility: 'private', ...testable })
    later()
    await act.publish(nora.cookie, 'Hors de la ruche', testable)
    later()
    await act.publish(max.cookie, 'Pas encore testable')

    const seeking = (await hives.page(famille.id, ines.cookie)).seekingTesters
    expect(seeking.map((project) => project.id).sort()).toEqual([plan.id, open.id].sort())
  })

  it('names the oldest member as the successor of the animator, and nobody for the others', async () => {
    const famille = await family()

    expect((await hives.page(famille.id, ines.cookie)).successor).toEqual({ name: 'Léa' })
    expect((await hives.page(famille.id, lea.cookie)).successor).toBeNull()
  })
})

// ─── L'actualité et les projets ───────────────────────────────────────────────────────────────────

describe('the activity and the projects of a hive', () => {
  it('lists, newest first, what members publish, reserved to the hive or for members, never another hive or a private project', async () => {
    const famille = await family()
    later()
    const amis = await hives.create(lea.cookie, 'Amis du jeudi', 'coffee')
    later()
    const plan = await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id)
    later()
    const open = await act.publish(max.cookie, 'Biscotte au parc')
    later()
    await act.publish(lea.cookie, 'Carnet secret', { visibility: 'private' })
    later()
    await hives.publishReserved(lea.cookie, 'Jeu du jeudi', amis.id)
    later()
    await act.publish(nora.cookie, 'Hors de la ruche')

    const page = await activityOf(famille.id, ines.cookie)
    expect(page.items.map((item) => [item.kind, item.project.id, item.reserved])).toEqual([
      ['published', open.id, false],
      ['published', plan.id, true],
    ])
    expect(page.items[0]?.actor.id).toBe(max.id)
    expect(page.nextCursor).toBeNull()
  })

  it('goes back 30 days, by pages of 20', async () => {
    const famille = await family()
    later()
    await hives.publishReserved(lea.cookie, 'Trop ancien', famille.id)
    later(31 * DAY)
    // Une session dure 7 jours : on se reconnecte.
    await hives.signInAgain(ines, lea, max)
    // 21 projets récents, partagés entre deux membres (20 publications par jour au plus chacun).
    const titles: string[] = []
    for (let index = 0; index < 21; index += 1) {
      later()
      const title = `Projet ${index + 1}`
      titles.unshift(title)
      await hives.publishReserved(index % 2 === 0 ? lea.cookie : max.cookie, title, famille.id)
    }

    const first = await activityOf(famille.id, ines.cookie)
    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).not.toBeNull()
    const second = await activityOf(famille.id, ines.cookie, first.nextCursor ?? undefined)
    expect([...first.items, ...second.items].map((item) => item.project.title)).toEqual(titles)
    expect(second.nextCursor).toBeNull()
  })

  it('lists in the projects tab the projects reserved to the hive, newest first, and nothing else', async () => {
    const famille = await family()
    later()
    const plan = await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id)
    later()
    await act.publish(max.cookie, 'Biscotte au parc')
    later()
    const carte = await hives.publishReserved(max.cookie, 'La carte des cousins', famille.id)
    // Un projet de Max réservé à une autre ruche, où Inès n'est pas.
    later()
    const amis = await hives.create(max.cookie, 'Amis du jeudi', 'coffee')
    later()
    await hives.publishReserved(max.cookie, 'Jeu du jeudi', amis.id)

    const page = await projectsOf(famille.id, ines.cookie)
    expect(page.items.map((project) => project.id)).toEqual([carte.id, plan.id])
    expect(page.nextCursor).toBeNull()
  })

  it('hides from the activity, the projects and the members a member blocked either way', async () => {
    const famille = await family()
    later()
    const carte = await hives.publishReserved(max.cookie, 'La carte des cousins', famille.id)
    const shows = async (viewer: TestMember) => ({
      activity: (await activityOf(famille.id, viewer.cookie)).items.some(
        (item) => item.project.id === carte.id,
      ),
      projects: (await projectsOf(famille.id, viewer.cookie)).items.some(
        (project) => project.id === carte.id,
      ),
      members: (await hives.members(famille.id, viewer.cookie)).some(
        (member) => member.face.id === max.id,
      ),
    })
    const all = { activity: true, projects: true, members: true }
    const none = { activity: false, projects: false, members: false }
    // Témoin : avant tout blocage, Léa voit Max partout.
    expect(await shows(lea)).toEqual(all)

    later()
    await act.block(max.id, lea.cookie)
    expect(await shows(lea)).toEqual(none)
    // Dans l'autre sens : Max bloque Léa.
    later()
    await act.unblock(max.id, lea.cookie)
    later()
    await act.block(lea.id, max.cookie)
    expect(await shows(lea)).toEqual(none)
    // Inès, ni bloquée ni bloquante, voit toujours tout.
    expect(await shows(ines)).toEqual(all)
  })
})

// ─── L'animateur ──────────────────────────────────────────────────────────────────────────────────

describe('the animator', () => {
  it('renames the hive, changes its icon and who may invite, and other members are refused with 403', async () => {
    const famille = await family()

    const res = await act.send('PATCH', `/v1/hives/${famille.id}`, ines.cookie, {
      name: 'Famille Haddad',
      icon: 'heart',
      invitePolicy: 'animator',
    })
    expect(res.status).toBe(200)
    const page = HivePage.parse(await res.json())
    expect(page.summary).toEqual(expect.objectContaining({ name: 'Famille Haddad', icon: 'heart' }))
    expect(page.invitePolicy).toBe('animator')
    // Léa, membre, voit que seul l'animateur invite.
    expect((await hives.page(famille.id, lea.cookie)).invite).toBe('animatorOnly')
    expect((await hives.page(famille.id, ines.cookie)).invite).toBe('allowed')

    await expectError(
      await act.send('PATCH', `/v1/hives/${famille.id}`, lea.cookie, { name: 'Chez Léa' }),
      403,
      'forbidden',
    )
    expect((await hives.page(famille.id, lea.cookie)).summary.name).toBe('Famille Haddad')
  })

  it('refuses with the same 422 an unknown, private or other-hive project to pin', async () => {
    const famille = await family()
    later()
    const amis = await hives.create(ines.cookie, 'Amis du jeudi', 'coffee')
    later()
    const plan = await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id)
    later()
    const open = await act.publish(max.cookie, 'Biscotte au parc')
    later()
    const secret = await act.publish(ines.cookie, 'Carnet secret', { visibility: 'private' })
    later()
    const elsewhere = await hives.publishReserved(ines.cookie, 'Jeu du jeudi', amis.id)
    later()
    // Un projet « Membres » de quelqu'un qui n'est pas dans la ruche : toute la ruche le voit, mais
    // il n'est pas « d'un membre de la ruche » (le scénario, « Le projet épinglé »).
    const outside = await act.publish(nora.cookie, 'Hors de la ruche')
    const pin = (pinnedProjectId: string | null) =>
      act.send('PATCH', `/v1/hives/${famille.id}`, ines.cookie, { pinnedProjectId })

    const refusals: string[] = []
    for (const id of [UNKNOWN, secret.id, elsewhere.id, outside.id]) {
      const res = await pin(id)
      refusals.push(`${res.status} ${await res.text()}`)
    }
    expect(refusals[0]).toMatch(/^422 /)
    expect(ErrorResponse.parse(JSON.parse(refusals[0]?.slice(4) ?? '')).error.code).toBe(
      'pin_not_visible',
    )
    expect(new Set(refusals).size).toBe(1)
    expect((await hives.page(famille.id, lea.cookie)).pinned).toBeNull()

    // Témoins : un projet réservé à la ruche s'épingle, avec qui l'a épinglé ; un projet « Membres »
    // d'un membre le remplace ; null retire l'épingle.
    later()
    const first = await pin(plan.id)
    expect(first.status).toBe(200)
    expect(HivePage.parse(await first.json()).pinned).toEqual(
      expect.objectContaining({ id: plan.id, pinnedBy: { id: ines.id, name: 'Inès Haddad' } }),
    )
    later()
    expect((await pin(open.id)).status).toBe(200)
    expect((await hives.page(famille.id, lea.cookie)).pinned?.id).toBe(open.id)
    const pinned = (await activityOf(famille.id, lea.cookie)).items[0]
    expect([pinned?.kind, pinned?.project.id, pinned?.actor.id]).toEqual([
      'pinned',
      open.id,
      ines.id,
    ])
    later()
    expect((await pin(null)).status).toBe(200)
    expect((await hives.page(famille.id, lea.cookie)).pinned).toBeNull()
  })

  it('refuses with the same 422 a project of a member blocked either way to pin', async () => {
    const famille = await family()
    later()
    const open = await act.publish(lea.cookie, 'Biscotte au parc')
    later()
    const carte = await act.publish(max.cookie, 'La carte des cousins')
    const pin = async (pinnedProjectId: string | null) => {
      const res = await act.send('PATCH', `/v1/hives/${famille.id}`, ines.cookie, {
        pinnedProjectId,
      })
      return `${res.status} ${await res.text()}`
    }
    const unknown = await pin(UNKNOWN)
    // Témoin : sans blocage, le projet de Léa s'épingle.
    expect(await pin(open.id)).toMatch(/^200 /)
    expect(await pin(null)).toMatch(/^200 /)

    later()
    await act.block(ines.id, lea.cookie)
    later()
    await act.block(max.id, ines.cookie)
    expect(await pin(open.id)).toBe(unknown)
    expect(await pin(carte.id)).toBe(unknown)
  })

  it('hands the animation over to a member, and refuses a non-member or another member with 403', async () => {
    const famille = await family()

    // Nora n'est pas dans la ruche : le même 404 qu'un membre inconnu.
    expect(
      await answer('POST', `/v1/hives/${famille.id}/animator`, ines.cookie, { userId: nora.id }),
    ).toBe(
      await answer('POST', `/v1/hives/${famille.id}/animator`, ines.cookie, { userId: 'nobody' }),
    )
    await expectError(
      await act.send('POST', `/v1/hives/${famille.id}/animator`, lea.cookie, { userId: lea.id }),
      403,
      'forbidden',
    )

    later()
    const res = await act.send('POST', `/v1/hives/${famille.id}/animator`, ines.cookie, {
      userId: lea.id,
    })
    expect(res.status).toBe(204)
    expect((await hives.mine(lea.cookie)).hives[0]?.role).toBe('animator')
    expect((await hives.mine(ines.cookie)).hives[0]?.role).toBe('member')
    expect((await hives.page(famille.id, max.cookie)).summary.animator).toEqual({
      id: lea.id,
      name: 'Léa',
    })
  })

  it('removes a member, whose reserved projects become private, and who may be invited again', async () => {
    const famille = await family()
    later()
    const plan = await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id)

    // Max, simple membre, ne retire personne.
    await expectError(
      await act.send(
        'DELETE',
        `/v1/hives/${famille.id}/members/${encodeURIComponent(lea.id)}`,
        max.cookie,
      ),
      403,
      'forbidden',
    )
    later()
    await hives.removeMember(famille.id, ines.cookie, lea.id)

    expect((await act.send('GET', `/v1/hives/${famille.id}`, lea.cookie)).status).toBe(404)
    expect((await hives.mine(lea.cookie)).hives).toEqual([])
    expect((await projectAs(plan.id, lea.cookie)).visibility).toBe('private')
    expect((await projectAs(plan.id, lea.cookie)).hive).toBeNull()
    expect((await act.send('GET', `/v1/projects/${plan.id}`, max.cookie)).status).toBe(404)
    expect((await hives.members(famille.id, ines.cookie)).map((member) => member.face.id)).toEqual([
      ines.id,
      max.id,
    ])
    // Plus tard, Inès peut la réinviter.
    later()
    await hives.invite(famille.id, ines.cookie, lea.id)
  })

  it('deletes the hive, whose reserved projects become private for their authors', async () => {
    const famille = await family()
    later()
    const plan = await hives.publishReserved(lea.cookie, 'Le plan de table', famille.id)

    await expectError(
      await act.send('DELETE', `/v1/hives/${famille.id}`, lea.cookie),
      403,
      'forbidden',
    )
    later()
    expect((await act.send('DELETE', `/v1/hives/${famille.id}`, ines.cookie)).status).toBe(204)

    for (const member of [ines, lea, max]) {
      expect((await act.send('GET', `/v1/hives/${famille.id}`, member.cookie)).status).toBe(404)
      expect((await hives.mine(member.cookie)).hives).toEqual([])
    }
    expect((await hives.mine(ines.cookie)).createdCount).toBe(0)
    expect((await projectAs(plan.id, lea.cookie)).visibility).toBe('private')
    expect((await act.send('GET', `/v1/projects/${plan.id}`, max.cookie)).status).toBe(404)
  })
})

// ─── Les membres et quitter ───────────────────────────────────────────────────────────────────────

describe('the members of a hive', () => {
  it('lists the animator first, then the members by date of entry, with « toi »', async () => {
    const famille = await family()

    const members = await hives.members(famille.id, lea.cookie)
    expect(members.map((member) => [member.face.id, member.role, member.isMe])).toEqual([
      [ines.id, 'animator', false],
      [lea.id, 'member', true],
      [max.id, 'member', false],
    ])
    expect(members.every((member) => member.handle !== null && !member.reduced)).toBe(true)
  })

  it('lets a member leave, and their reserved projects become private', async () => {
    const famille = await family()
    later()
    const plan = await hives.publishReserved(max.cookie, 'La carte des cousins', famille.id)
    later()
    await hives.removeMember(famille.id, max.cookie, max.id)

    expect((await hives.mine(max.cookie)).hives).toEqual([])
    expect((await projectAs(plan.id, max.cookie)).visibility).toBe('private')
    expect((await hives.page(famille.id, ines.cookie)).summary.memberCount).toBe(2)
  })

  it('gives the animation to the oldest member when the animator leaves', async () => {
    const famille = await family()
    later()
    await hives.removeMember(famille.id, ines.cookie, ines.id)

    expect((await hives.page(famille.id, max.cookie)).summary.animator).toEqual({
      id: lea.id,
      name: 'Léa',
    })
    expect((await hives.mine(lea.cookie)).hives[0]?.role).toBe('animator')
  })

  it('deletes the hive when its last member leaves', async () => {
    later()
    const famille = await hives.create(ines.cookie)
    later()
    await hives.removeMember(famille.id, ines.cookie, ines.id)

    expect((await act.send('GET', `/v1/hives/${famille.id}`, ines.cookie)).status).toBe(404)
    expect(await hives.mine(ines.cookie)).toEqual({ hives: [], invitations: [], createdCount: 0 })
  })

  it('never shows a removed avatar on any hive route that shows a member', async () => {
    const louis = await signedUpMember(ctx, act, 'Louis', '198.51.100.9')
    await act.makeAdmin(louis.id)
    later()
    const res = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: ines.cookie },
      body: avatarForm(await jpegImage(600, 600, '#c0563b')),
    })
    expect(res.ok, `avatar: ${res.status}`).toBe(true)
    const file = new URL((await act.me(ines.cookie)).avatarUrl ?? 'http://x/none').pathname
      .split('/')
      .pop()
    const famille = await family()
    later()
    await hives.publishReserved(ines.cookie, 'Le plan de table', famille.id)
    later()
    await hives.invite(famille.id, ines.cookie, zoe.id)
    // Les lieux où Léa (et Zoé, invitée) rencontrent Inès dans une ruche.
    const routes: [string, string][] = [
      ['/v1/hives', lea.cookie],
      [`/v1/hives/${famille.id}`, lea.cookie],
      [`/v1/hives/${famille.id}/activity`, lea.cookie],
      [`/v1/hives/${famille.id}/projects`, lea.cookie],
      [`/v1/hives/${famille.id}/members`, lea.cookie],
      [`/v1/hives/${famille.id}/invitable?q=ines`, lea.cookie],
      ['/v1/hives', zoe.cookie],
    ]
    const showing = async () => {
      const found: string[] = []
      for (const [path, cookie] of routes) {
        const read = await act.send('GET', path, cookie)
        expect(read.status, `GET ${path}`).toBe(200)
        if ((await read.text()).includes(file ?? 'none'))
          found.push(`${path} (${cookie === zoe.cookie ? 'Zoé' : 'Léa'})`)
      }
      return found
    }
    // Témoin : avant le retrait, chacune de ces routes montre la photo d'Inès.
    expect(await showing()).toHaveLength(routes.length)

    later()
    // La modération retire la photo comme dans l'appli : Léa signale cette partie, Louis décide.
    const reported = await act.send('POST', '/v1/reports', lea.cookie, {
      target: { kind: 'member', id: ines.id },
      part: { field: 'avatar' },
      reason: 'other',
    })
    expect(reported.status).toBe(201)
    later()
    await act.decide(louis.cookie, {
      action: 'remove',
      target: { kind: 'member', id: ines.id },
      part: { field: 'avatar' },
      ground: 'rules',
      explanation: 'Cette partie ne respecte pas les règles de la communauté.',
    })

    expect(await showing()).toEqual([])
  })
})
