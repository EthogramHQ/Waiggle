// Tests d'intégration de R11, « Découvertes » : le réglage qui retire du récap du dimanche ses deux
// parties qui font découvrir, « Nouveaux projets de tes proches » et « Ils cherchent des testeurs »
// (PATCH /v1/me/email-preferences, `discoveries`), et « Couper les découvertes » de la page de
// désinscription du récap (POST /v1/email/unsubscribe?scope=discoveries). Scénario :
// docs/scenarios/refonte.md, « R11 », « Le récap : couper les découvertes » ; relecture du plan
// (S-C1 et J4 : la ligne de journal `Unsubscribe <id> discoveries never`, écrite depuis le lien comme
// depuis les réglages, que la procédure de restauration relit).
//
// Quatre membres : Inès (qui reçoit le récap), Malik (qu'elle suit, et qui publie), Zoé (qui suit
// aussi Malik, avec les réglages par défaut : le témoin) et Sam (qui commente). La fausse horloge part
// d'un dimanche, 10 h à Paris, comme les tests du récap (jobs/weekly-recap.test.ts).
import { readFileSync } from 'node:fs'
import { AccountExport, ErrorResponse, type UnsubscribeKind } from '@ruche/contracts'
import { fill, resources } from '@ruche/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { weeklyRecap } from './jobs/weekly-recap'
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
let ines: string // cookies de session
let malik: string
let zoe: string
let sam: string
let inesId: string
let malikId: string

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const START = new Date('2026-06-14T08:00:00.000Z') // un dimanche, 10 h à Paris
const TESTABLE = { status: 'testable', demoUrl: 'https://papillon-demo.example.com/' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  const member = (name: string, local: string) =>
    ctx.verifiedMember({
      name,
      email: `${local}@example.com`,
      password: `${local}-long-password`,
    })
  ines = await member('Inès Morel', 'ines')
  malik = await member('Malik', 'malik')
  zoe = await member('Zoé', 'zoe')
  sam = await member('Sam', 'sam')
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

// ─── Le récap ────────────────────────────────────────────────────────────────────────────────────

/** Lance le récap à l'heure de la fausse horloge (comme pg-boss le dimanche à 10 h). */
const runRecap = () =>
  weeklyRecap(
    {
      db: ctx.db,
      mailer: ctx.mailer,
      storage: ctx.storage,
      appUrl: TEST_APP_URL,
      apiUrl: TEST_API_URL,
      secret: TEST_AUTH_SECRET,
    },
    new Date(),
  )

const recapSubjects = [fill(fr.recap.subject), fill(en.recap.subject)]
/** Les récaps reçus par une adresse (sans les e-mails de compte). */
const recapsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && recapSubjects.includes(email.subject))
const onlyRecapTo = (address: string) => {
  const recaps = recapsTo(address)
  expect(recaps).toHaveLength(1)
  const [recap] = recaps
  if (!recap) throw new Error(`no recap to ${address}`)
  return recap
}

const projectUrl = (id: string) => `${TEST_APP_URL}/projects/${id}`

/**
 * La semaine de Malik, que suivent Inès et Zoé : un nouveau projet, et un projet testable (les deux
 * parties « Découvertes » du récap).
 */
const malikPublishes = async () => {
  later()
  await act.followMember(malikId, ines)
  later()
  await act.followMember(malikId, zoe)
  later()
  const fresh = await act.publish(malik, 'Décollage !')
  later()
  const testable = await act.publish(malik, 'Quel papillon ?', TESTABLE)
  return { fresh, testable }
}

// ─── La désinscription et le journal ─────────────────────────────────────────────────────────────

const tokenOf = (userId: string, kind: UnsubscribeKind) =>
  createUnsubscribeToken(TEST_AUTH_SECRET, userId, kind)

/** Le POST du bouton « Confirmer » de la page de désinscription : sans cookie, sans corps. */
const unsubscribe = (params: Record<string, string>) =>
  ctx.request(`/v1/email/unsubscribe?${new URLSearchParams(params)}`, { method: 'POST' })

/** Les lignes `Unsubscribe …` que l'API écrit dans ses journaux pendant `action`. */
const unsubscribeLinesDuring = async (action: () => unknown) => {
  const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )
  // Les lignes se lisent avant de rendre la console : mockRestore efface aussi les appels notés.
  try {
    await action()
    return spies
      .flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
      .filter((line) => line.startsWith('Unsubscribe '))
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
}

/**
 * Le motif des lignes que la procédure de restauration garde (`grep -E "…"` de docs/ops/serveur.md,
 * « Sauvegardes ») : une baisse qu'il ne lirait pas serait perdue à la restauration d'une sauvegarde.
 */
const restoreMotif = () => {
  const procedure = readFileSync(new URL('../../../docs/ops/serveur.md', import.meta.url), 'utf8')
  const found = /grep -E "(\^\(Unsubscribe [^"]*?)\\\$"/.exec(procedure)?.[1]
  if (!found) throw new Error('no grep motif in docs/ops/serveur.md')
  return new RegExp(`${found}$`)
}

const exportOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  return AccountExport.parse(await res.json())
}

// ─── Les tests ───────────────────────────────────────────────────────────────────────────────────

describe('the setting « Découvertes »', () => {
  it('is in the recap by default, for every member, and in the export', async () => {
    expect((await act.preferences(ines)).discoveries).toBe('digest')
    expect((await exportOf(ines)).emailPreferences.discoveries).toBe('digest')
  })

  it('can be set to never and back to the recap, never to now', async () => {
    expect((await act.setPreferences(ines, { discoveries: 'never' })).discoveries).toBe('never')
    expect((await exportOf(ines)).emailPreferences.discoveries).toBe('never')
    const now = await act.send('PATCH', '/v1/me/email-preferences', ines, { discoveries: 'now' })
    expect(now.status).toBe(400)
    expect(ErrorResponse.parse(await now.json()).error.code).toBe('validation')
    expect((await act.preferences(ines)).discoveries).toBe('never')
    expect((await act.setPreferences(ines, { discoveries: 'digest' })).discoveries).toBe('digest')
  })
})

describe('the recap without the discoveries', () => {
  it('leaves out the new projects of my friends and « they look for testers », and keeps the other parts', async () => {
    const { fresh, testable } = await malikPublishes()
    later()
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.comment(meteo.id, sam, 'Super idée, je teste ce soir.')
    await act.setPreferences(ines, { discoveries: 'never' })
    later(HOUR)

    await runRecap()

    // Témoin : Zoé, réglée par défaut, reçoit les deux parties.
    const witness = onlyRecapTo('zoe@example.com')
    for (const part of [fr.recap.friendsTitle, fr.recap.testersWanted, 'Décollage !']) {
      expect(witness.text, part).toContain(part)
    }
    const recap = onlyRecapTo('ines@example.com')
    // Ses autres parties restent : son projet et son commentaire.
    expect(recap.text).toContain('Météo')
    for (const part of [
      fr.recap.friendsTitle,
      fr.recap.testersWanted,
      'Décollage !',
      'Quel papillon ?',
    ]) {
      expect(recap.text, part).not.toContain(part)
      expect(recap.html, part).not.toContain(part)
    }
    for (const project of [fresh, testable]) {
      expect(recap.html).not.toContain(projectUrl(project.id))
    }
  })

  it('sends no recap when the discoveries are its only news', async () => {
    await malikPublishes()
    await act.setPreferences(ines, { discoveries: 'never' })
    later(HOUR)

    await runRecap()

    expect(recapsTo('ines@example.com')).toEqual([])
    // Témoin : Zoé, qui suit aussi Malik, reçoit son récap.
    expect(onlyRecapTo('zoe@example.com').text).toContain(fr.recap.friendsTitle)
  })
})

describe('cutting the discoveries from the unsubscribe page', () => {
  it('sets the discoveries to never with scope=discoveries on a recap link, and keeps the recap', async () => {
    const res = await unsubscribe({ token: tokenOf(inesId, 'recap'), scope: 'discoveries' })

    expect(res.status).toBe(204)
    expect(await act.preferences(ines)).toMatchObject({ weeklyRecap: true, discoveries: 'never' })
    // Le lien ne vise qu'Inès.
    expect((await act.preferences(malik)).discoveries).toBe('digest')
  })

  it("refuses scope=discoveries on a link that is not the recap's, and changes nothing", async () => {
    const before = await act.preferences(ines)

    for (const kind of ['instant', 'mentions'] as const) {
      const res = await unsubscribe({ token: tokenOf(inesId, kind), scope: 'discoveries' })
      expect(res.status, kind).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('unsubscribe_invalid')
    }
    expect(await act.preferences(ines)).toEqual(before)
  })

  it('writes Unsubscribe <id> discoveries never from the link and from the settings, a line the restore reads', async () => {
    const lines = await unsubscribeLinesDuring(async () => {
      expect(
        (await unsubscribe({ token: tokenOf(inesId, 'recap'), scope: 'discoveries' })).status,
      ).toBe(204)
      await act.setPreferences(malik, { discoveries: 'never' })
      // Remonter le réglage n'écrit rien ; le couper une seconde fois non plus.
      await act.setPreferences(malik, { discoveries: 'digest' })
      expect(
        (await unsubscribe({ token: tokenOf(inesId, 'recap'), scope: 'discoveries' })).status,
      ).toBe(204)
    })

    expect(lines).toEqual([
      `Unsubscribe ${inesId} discoveries never`,
      `Unsubscribe ${malikId} discoveries never`,
    ])
    const motif = restoreMotif()
    for (const line of lines) expect(line).toMatch(motif)
    expect(await act.preferences(ines)).toMatchObject({ weeklyRecap: true, discoveries: 'never' })
  })
})
