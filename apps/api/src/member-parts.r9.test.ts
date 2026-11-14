// Tests d'intégration de R9 (relectures) : ce que la page d'un membre et son export disent d'un nom,
// d'un pseudo, d'une bio ou d'outils favoris retirés par la modération.
//
// - Page (DSA art. 17, jur-B3) : le nom et le pseudo retirés n'ont pas de ligne `content_part_removal`
//   (la décision garde l'ancien) ; tant qu'ils sont provisoires, leur auteur, et lui seul, les relit
//   dans `removedParts` avec le fondement, la date et de quoi contester.
// - Export (RGPD art. 15 et 20, jur-B5) : la bio et les outils retirés ne vivent plus que dans la
//   ligne de retrait ; l'export les donne dans `profileRemovedParts`, avec leur décision, jamais
//   l'administrateur ni qui a signalé ni le nom provisoire.
//
// Trois membres : Léa (dont on lit la page et l'export), Max (qui signale) et Louis (administrateur).
import { AccountExport, Member, type ReportPart } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let louis: string
let leaId: string
let maxId: string
let louisId: string

const EXPLANATION = 'Ce pseudo imite celui d’un autre membre.'

/** Avance la fausse horloge d'une seconde : deux gestes n'ont jamais la même date. */
const later = () => vi.setSystemTime(Date.now() + 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Max signale une partie du profil de Léa, Louis la retire ; rend la date de la décision. */
const removeFromLea = async (part: ReportPart) => {
  later()
  const reported = await act.send('POST', '/v1/reports', max, {
    target: { kind: 'member', id: leaId },
    part,
    reason: part.field === 'handle' ? 'impersonation' : 'other',
  })
  expect(reported.status).toBe(201)
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'member', id: leaId },
    part,
    ground: 'rules',
    explanation: EXPLANATION,
  })
  return new Date(Date.now()).toISOString()
}

/** La page de Léa, lue par ce visiteur (texte brut et lecture). */
const pageOfLea = async (cookie: string) => {
  const res = await act.send('GET', `/v1/members/${encodeURIComponent(leaId)}`, cookie)
  expect(res.status).toBe(200)
  const text = await res.text()
  return { text, member: Member.parse(JSON.parse(text)) }
}

describe('a removed name or handle on the page of its former owner', () => {
  it('shows the ground, the date and Contester of a removed handle on the page of its former owner while it is provisional', async () => {
    later()
    await act.updateProfile(lea, { handle: 'lea_meteo' })
    const removedAt = await removeFromLea({ field: 'handle' })

    const { member } = await pageOfLea(lea)

    // Témoin : le pseudo d'office remplace bien l'ancien.
    expect(member.handle).not.toBe('lea_meteo')
    expect(member.removedParts).toEqual([
      {
        field: 'handle',
        mediaId: null,
        value: 'lea_meteo',
        imageUrl: null,
        removal: { ground: 'rules', explanation: EXPLANATION, at: removedAt, afterReport: true },
      },
    ])
  })

  it('shows a removed name the same way, until she chooses another', async () => {
    const removedAt = await removeFromLea({ field: 'name' })

    const before = await pageOfLea(lea)
    expect(before.member.name).not.toBe('Léa')
    expect(before.member.removedParts).toEqual([
      {
        field: 'name',
        mediaId: null,
        value: 'Léa',
        imageUrl: null,
        removal: { ground: 'rules', explanation: EXPLANATION, at: removedAt, afterReport: true },
      },
    ])

    // Elle choisit un autre nom : plus provisoire, la partie n'est plus à contester ici.
    later()
    await act.updateProfile(lea, { name: 'Léa M.' })
    expect((await pageOfLea(lea)).member.removedParts).toEqual([])
  })

  it('never gives the former handle or the decision to another member', async () => {
    later()
    await act.updateProfile(lea, { handle: 'lea_meteo' })
    await removeFromLea({ field: 'handle' })

    for (const cookie of [max, louis]) {
      const { text, member } = await pageOfLea(cookie)
      expect(member.removedParts).toEqual([])
      expect(text).not.toContain('lea_meteo')
      expect(text).not.toContain(EXPLANATION)
    }
  })

  it('stops showing a removed handle once it has been restored by the moderation', async () => {
    later()
    await act.updateProfile(lea, { handle: 'lea_meteo' })
    await removeFromLea({ field: 'handle' })
    later()
    await act.decide(louis, {
      action: 'restore',
      target: { kind: 'member', id: leaId },
      part: { field: 'handle' },
    })

    const { member } = await pageOfLea(lea)

    expect(member.handle).toBe('lea_meteo')
    expect(member.removedParts).toEqual([])
  })
})

describe('a removed bio and removed favorite tools in the export', () => {
  it('exports a removed bio and removed favorite tools with their decision', async () => {
    later()
    await act.updateProfile(lea, { bio: 'Mes pronostics gagnants.', favoriteTools: ['Claude'] })
    const bioAt = await removeFromLea({ field: 'bio' })
    const toolsAt = await removeFromLea({ field: 'favoriteTools' })

    const res = await act.send('GET', '/v1/me/export', lea)
    expect(res.status).toBe(200)
    const text = await res.text()
    const data = AccountExport.parse(JSON.parse(text))

    // Témoin : la colonne est bien vidée, le texte n'est plus que dans le retrait.
    expect(data.user.bio).toBe('')
    const removal = (at: string) => ({
      ground: 'rules',
      explanation: EXPLANATION,
      at,
      afterReport: true,
    })
    expect(data.profileRemovedParts).toEqual([
      {
        field: 'bio',
        mediaId: null,
        value: 'Mes pronostics gagnants.',
        imageUrl: null,
        removal: removal(bioAt),
      },
      {
        field: 'favoriteTools',
        mediaId: null,
        value: ['Claude'],
        imageUrl: null,
        removal: removal(toolsAt),
      },
    ])
    // Jamais l'administrateur ni qui a signalé, et aucune clé de plus que le contrat.
    for (const absent of [louisId, maxId, '"name":"Louis"', '"name":"Max"']) {
      expect(text).not.toContain(absent)
    }
    const raw = JSON.parse(text) as { profileRemovedParts: object[] }
    expect(raw.profileRemovedParts.map((part) => Object.keys(part).sort())).toEqual([
      ['field', 'imageUrl', 'mediaId', 'removal', 'value'],
      ['field', 'imageUrl', 'mediaId', 'removal', 'value'],
    ])
  })

  it('exports no removed profile part for a member whose profile is untouched', async () => {
    const res = await act.send('GET', '/v1/me/export', lea)
    expect(AccountExport.parse(await res.json()).profileRemovedParts).toEqual([])
  })
})
