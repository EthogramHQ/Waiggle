// Tests d'intégration de R11 : les comptes inactifs. Chaque visite d'un membre connecté note sa
// dernière activité (`user.last_active_at`, au plus une fois par jour) et efface l'avertissement
// déjà parti (`user.inactive_notice_at`). Chaque nuit, une tâche (jobs/inactive-accounts.ts)
// prévient par e-mail, une seule fois, un compte sans visite depuis 3 ans moins 30 jours, puis le
// supprime à 3 ans, seulement si l'e-mail est parti depuis 30 jours : la même suppression que
// « Supprimer mon compte » (account/delete.ts), avec la même ligne de journal.
//
// Scénario : docs/scenarios/refonte.md, R11, « Les durées, les purges et l'éditeur » ; relecture du
// plan : S-C1 (la ligne de journal), S-C2 (l'e-mail accepté avant la date notée, l'activité relue
// juste avant la suppression, une seule liste d'étapes), J3 (un e-mail de service).
//
// La tâche est une fonction ordinaire, inactiveAccounts(deps, now), comme les autres tâches : le
// test l'appelle lui-même sur PGlite, à l'heure qu'il choisit (charte de l'API). Les dates de
// dernière activité sont posées en base : l'inscription d'un test ne dit rien de l'âge d'un compte.
import { DEFAULT_EMAIL_PREFERENCES, INACTIVE_NOTICE_DAYS } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, type Language, resources } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mailer } from './email/mailer'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { inactiveAccounts, inactiveDeletionDate } from './jobs/inactive-accounts'
import type { FileStorage } from './media/storage'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'
import { hiveGestures } from './testing/hive-gestures'
import { hiveRow } from './testing/hive-seeds'
import { avatarForm, jpegImage, visualForm } from './testing/images'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** La même date, tant d'années plus tard (années du calendrier, en UTC). */
const yearsAfter = (date: Date, years: number) => {
  const next = new Date(date)
  next.setUTCFullYear(next.getUTCFullYear() + years)
  return next
}
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms)

// La dernière visite de Léa. Le 1er mars 2028 : 3 années du calendrier après, le 1er mars 2031,
// font exactement 3 × 365 jours (aucun 29 février entre les deux), et les deux lectures de
// « 3 ans » donnent la même date. Les essais gardent de toute façon 2 jours de marge.
const LAST_VISIT = new Date('2028-03-01T09:00:00.000Z')
const THREE_YEARS = yearsAfter(LAST_VISIT, 3)
/** Le jour où l'e-mail doit partir : 3 ans moins 30 jours après la dernière visite. */
const WARNING_DUE = plus(THREE_YEARS, -INACTIVE_NOTICE_DAYS * DAY)

const fr = resources.fr.translation.email.inactive

/**
 * La date de suppression telle qu'un e-mail l'écrit : le jour, en toutes lettres, à l'heure de
 * Paris, l'année comprise (« 1 mars 2031 »), comme la fin d'une suspension (templates.ts).
 */
const writtenDate = (language: Language, date: Date) =>
  new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(date)

let ctx: TestContext
let act: ReturnType<typeof activity>

type Member = { id: string; cookie: string; email: string; password: string; name: string }

beforeEach(async () => {
  // Une fausse horloge, posée avant l'API (charte) : seule Date est remplacée.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(LAST_VISIT)
  ctx = await createTestContext()
  act = activity(ctx)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * Inscrit un membre depuis sa propre adresse IP (le quota d'inscription par IP, charte), dans sa
 * langue, et ouvre son lien de vérification.
 */
const member = async (name: string, ip: string, language: Language = 'fr'): Promise<Member> => {
  const local = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
  const email = `${local}@example.com`
  const password = `${local}-long-password`
  await ctx.signUp({ name, email, password, language }, { 'x-real-ip': ip })
  const sent = ctx.mailer.sent.findLast((mail) => mail.to === email)
  const link = sent?.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error(`no verification link for ${email}`)
  const url = new URL(link)
  const cookie = ctx.cookiesFrom(await ctx.request(url.pathname + url.search))
  return { id: (await act.me(cookie)).id, cookie, email, password, name }
}

/** Pose en base la dernière activité d'un membre, et la date de l'avertissement (null : aucun). */
const setActivity = async (userId: string, lastActiveAt: Date, noticeAt: Date | null = null) => {
  await ctx.db
    .update(schema.user)
    .set({ lastActiveAt, inactiveNoticeAt: noticeAt })
    .where(eq(schema.user.id, userId))
}

/** La ligne du compte en base (ses deux dates), ou null s'il a été supprimé. */
const accountOf = async (userId: string) => {
  const [row] = await ctx.db
    .select({
      lastActiveAt: schema.user.lastActiveAt,
      inactiveNoticeAt: schema.user.inactiveNoticeAt,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
  return row ?? null
}

/** Les e-mails d'inactivité reçus à cette adresse (pas ceux de la vérification de l'adresse). */
const warningsTo = (email: string, language: Language = 'fr') => {
  const t = resources[language].translation.email.inactive
  // Le début du sujet, avant la date (« Ton compte … sera supprimé le »).
  const start = fill(t.subject, { date: '@DATE@' }).split('@DATE@')[0] ?? ''
  return ctx.mailer.sent.filter((mail) => mail.to === email && mail.subject.startsWith(start))
}

/** Lance la tâche à cette heure, l'horloge de l'API posée à la même heure. */
const runAt = async (
  now: Date,
  { mailer = ctx.mailer, storage = ctx.storage }: { mailer?: Mailer; storage?: FileStorage } = {},
) => {
  vi.setSystemTime(now)
  return inactiveAccounts(
    {
      db: ctx.db,
      mailer,
      storage,
      appUrl: TEST_APP_URL,
      apiUrl: TEST_API_URL,
      secret: TEST_AUTH_SECRET,
    },
    now,
  )
}

/** Les lignes écrites dans les journaux pendant `run` (console.log, info, warn et error). */
const logsDuring = async (run: () => Promise<unknown>) => {
  const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )
  try {
    await run()
    return spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
}

// ─── L'activité ──────────────────────────────────────────────────────────────────────────────────

describe('noting the activity of a member', () => {
  it('notes a visit as the last activity of the member', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, plus(LAST_VISIT, -10 * DAY))

    expect((await act.send('GET', '/v1/me', lea.cookie)).status).toBe(200)

    expect((await accountOf(lea.id))?.lastActiveAt).toEqual(LAST_VISIT)
  })

  it('notes the activity at most once a day', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, plus(LAST_VISIT, -10 * DAY))
    await act.send('GET', '/v1/me', lea.cookie)

    // Deux heures plus tard, le même jour : rien ne change.
    vi.setSystemTime(plus(LAST_VISIT, 2 * HOUR))
    await act.send('GET', '/v1/me', lea.cookie)
    expect((await accountOf(lea.id))?.lastActiveAt).toEqual(LAST_VISIT)

    // Le lendemain, plus de 24 heures après : la nouvelle visite est notée.
    const tomorrow = plus(LAST_VISIT, 25 * HOUR)
    vi.setSystemTime(tomorrow)
    await act.send('GET', '/v1/me', lea.cookie)
    expect((await accountOf(lea.id))?.lastActiveAt).toEqual(tomorrow)
  })

  it('clears the warning of an inactive account when the member comes back', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, plus(LAST_VISIT, -3 * 365 * DAY), plus(LAST_VISIT, -2 * DAY))

    await act.send('GET', '/v1/me', lea.cookie)

    expect(await accountOf(lea.id)).toEqual({ lastActiveAt: LAST_VISIT, inactiveNoticeAt: null })
  })

  // Un état qu'aucune route n'atteint seule (un avertissement parti juste après une visite, une
  // sauvegarde restaurée) : posé en base. La visite du jour est déjà notée, l'avertissement doit
  // tout de même partir, sinon le compte serait supprimé malgré la visite.
  it('clears a warning even when the activity of the day is already noted', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, plus(LAST_VISIT, -HOUR), plus(LAST_VISIT, -HOUR / 2))

    await act.send('GET', '/v1/me', lea.cookie)

    expect((await accountOf(lea.id))?.inactiveNoticeAt).toBeNull()
  })

  it('notes the visit of a member who has not accepted the current rules', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, plus(LAST_VISIT, -10 * DAY))
    // Inès, inscrite avant R11 : aucune version des règles acceptée. Lire reste permis, et revenir
    // la garde.
    await ctx.db.delete(schema.rulesAcceptance).where(eq(schema.rulesAcceptance.userId, lea.id))

    await act.send('GET', '/v1/me', lea.cookie)

    expect((await accountOf(lea.id))?.lastActiveAt).toEqual(LAST_VISIT)
  })

  it('notes the visit on the account of the visitor only', async () => {
    const lea = await member('Léa', '198.51.100.1')
    const max = await member('Max', '198.51.100.2')
    const old = plus(LAST_VISIT, -10 * DAY)
    await setActivity(lea.id, old)
    await setActivity(max.id, old, plus(LAST_VISIT, -DAY))

    await act.send('GET', '/v1/me', lea.cookie)

    expect((await accountOf(lea.id))?.lastActiveAt).toEqual(LAST_VISIT)
    // Témoin : le compte de Max ne bouge pas.
    expect(await accountOf(max.id)).toEqual({
      lastActiveAt: old,
      inactiveNoticeAt: plus(LAST_VISIT, -DAY),
    })
  })
})

// ─── L'avertissement ─────────────────────────────────────────────────────────────────────────────

describe('warning an inactive account', () => {
  it('sends nothing before 3 years minus 30 days without a visit', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, LAST_VISIT)

    const result = await runAt(plus(WARNING_DUE, -2 * DAY))

    expect(result).toEqual({ warned: 0, deleted: 0 })
    expect(warningsTo(lea.email)).toEqual([])
    expect(await accountOf(lea.id)).toEqual({ lastActiveAt: LAST_VISIT, inactiveNoticeAt: null })
    // Témoin : quatre jours plus tard, l'e-mail part.
    expect(await runAt(plus(WARNING_DUE, 2 * DAY))).toEqual({ warned: 1, deleted: 0 })
  })

  it('warns once, 30 days before the 3 years, and notes when the warning left', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, LAST_VISIT)
    const now = plus(WARNING_DUE, 2 * DAY)

    const result = await runAt(now)

    expect(result).toEqual({ warned: 1, deleted: 0 })
    const [warning] = warningsTo(lea.email)
    expect(warningsTo(lea.email)).toHaveLength(1)
    expect(warning?.subject).toBe(
      fill(fr.subject, { date: writtenDate('fr', inactiveDeletionDate(LAST_VISIT, now)) }),
    )
    expect((await accountOf(lea.id))?.inactiveNoticeAt).toEqual(now)

    // Le passage suivant, et celui de dix jours plus tard : aucun second e-mail.
    await runAt(plus(now, HOUR))
    await runAt(plus(now, 10 * DAY))
    expect(warningsTo(lea.email)).toHaveLength(1)
    expect((await accountOf(lea.id))?.inactiveNoticeAt).toEqual(now)
  })

  it('writes the warning in the language of the account', async () => {
    const sam = await member('Sam', '198.51.100.3', 'en')
    await setActivity(sam.id, LAST_VISIT)
    const now = plus(WARNING_DUE, 2 * DAY)

    await runAt(now)

    const en = resources.en.translation.email.inactive
    expect(warningsTo(sam.email, 'en').map((mail) => mail.subject)).toEqual([
      fill(en.subject, { date: writtenDate('en', inactiveDeletionDate(LAST_VISIT, now)) }),
    ])
  })

  // J3 : un e-mail de service. Le membre a tout réglé sur « Jamais », puis suivi le lien « Ne plus
  // rien recevoir » d'un récap (`scope=all`) : l'avertissement part quand même.
  it('sends the warning even when every email is set to never and all were unsubscribed', async () => {
    const lea = await member('Léa', '198.51.100.1')
    for (const key of Object.keys(DEFAULT_EMAIL_PREFERENCES)) {
      if (key === 'weeklyRecap') continue
      await act.setPreferences(lea.cookie, { [key]: 'never' })
    }
    const token = createUnsubscribeToken(TEST_AUTH_SECRET, lea.id, 'recap')
    const unsubscribed = await ctx.request(
      `/v1/email/unsubscribe?${new URLSearchParams({ token, scope: 'all' })}`,
      { method: 'POST' },
    )
    expect(unsubscribed.status).toBe(204)
    // Témoin : plus aucun e-mail réglé.
    expect((await act.preferences(lea.cookie)).weeklyRecap).toBe(false)
    await setActivity(lea.id, LAST_VISIT)

    await runAt(plus(WARNING_DUE, 2 * DAY))

    expect(warningsTo(lea.email)).toHaveLength(1)
  })

  it('does not delete when the warning could not be sent', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, LAST_VISIT)
    // Le prestataire refuse l'e-mail de Léa, avec un message qui contient son adresse.
    const refusing: Mailer = {
      async send(email) {
        if (email.to === lea.email) throw new Error(`refused: ${email.to}`)
        await ctx.mailer.send(email)
      },
    }

    const logs = await logsDuring(() => runAt(plus(WARNING_DUE, 2 * DAY), { mailer: refusing }))

    // La date n'est notée qu'une fois l'envoi accepté (S-C2) ; l'échec est noté sans l'adresse.
    expect((await accountOf(lea.id))?.inactiveNoticeAt).toBeNull()
    expect(logs.join('\n')).not.toContain(lea.email)

    // Bien après les 3 ans, toujours sans e-mail accepté : le compte reste.
    await runAt(plus(THREE_YEARS, 40 * DAY), { mailer: refusing })
    expect(await accountOf(lea.id)).toEqual({ lastActiveAt: LAST_VISIT, inactiveNoticeAt: null })

    // Le prestataire répond de nouveau : l'e-mail part, et la suppression attend encore 30 jours.
    const later = plus(THREE_YEARS, 41 * DAY)
    const result = await runAt(later)
    expect(result).toEqual({ warned: 1, deleted: 0 })
    expect(warningsTo(lea.email)).toHaveLength(1)
    expect((await accountOf(lea.id))?.inactiveNoticeAt).toEqual(later)
  })
})

// ─── La date de suppression ──────────────────────────────────────────────────────────────────────

describe('the date of deletion', () => {
  it('is 3 years after the last visit when the warning left on time', () => {
    // À l'heure : le jour même où il est dû, 30 jours avant les 3 ans (un e-mail parti deux jours
    // plus tard repousse la date de deux jours, test suivant).
    expect(inactiveDeletionDate(LAST_VISIT, WARNING_DUE)).toEqual(THREE_YEARS)
  })

  it('is 30 days after the warning when the warning left late', () => {
    const late = plus(THREE_YEARS, 100 * DAY)

    expect(inactiveDeletionDate(LAST_VISIT, late)).toEqual(plus(late, INACTIVE_NOTICE_DAYS * DAY))
  })

  // Une tâche arrêtée longtemps, une sauvegarde restaurée : l'e-mail part tard, et la date qu'il
  // écrit est tenue ; la suppression ne vient jamais avant.
  it('is never brought forward: a late warning gives its member 30 more days', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, LAST_VISIT)
    const late = plus(THREE_YEARS, 100 * DAY)
    const deleteOn = inactiveDeletionDate(LAST_VISIT, late)

    await runAt(late)
    expect(warningsTo(lea.email).map((mail) => mail.subject)).toEqual([
      fill(fr.subject, { date: writtenDate('fr', deleteOn) }),
    ])

    await runAt(plus(deleteOn, -HOUR))
    expect(await accountOf(lea.id)).not.toBeNull()

    const result = await runAt(plus(deleteOn, HOUR))
    expect(result).toEqual({ warned: 0, deleted: 1 })
    expect(await accountOf(lea.id)).toBeNull()
  })
})

// ─── La suppression ──────────────────────────────────────────────────────────────────────────────

describe('deleting an inactive account', () => {
  it('deletes the account 3 years after the last visit, once the warning is 30 days old', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, LAST_VISIT)
    const warnedAt = plus(WARNING_DUE, 2 * DAY)
    await runAt(warnedAt)

    // 3 ans et un jour : l'e-mail n'est parti que depuis 29 jours, le compte reste.
    await runAt(plus(THREE_YEARS, DAY))
    expect(await accountOf(lea.id)).not.toBeNull()

    // 30 jours après l'e-mail : supprimé, et sa session ne vaut plus rien.
    const result = await runAt(plus(warnedAt, INACTIVE_NOTICE_DAYS * DAY + HOUR))
    expect(result).toEqual({ warned: 0, deleted: 1 })
    expect(await accountOf(lea.id)).toBeNull()
    expect((await act.send('GET', '/v1/me', lea.cookie)).status).toBe(401)
  })

  it('keeps an account whose member came back after the warning', async () => {
    const lea = await member('Léa', '198.51.100.1')
    await setActivity(lea.id, LAST_VISIT)
    const warnedAt = plus(WARNING_DUE, 2 * DAY)
    await runAt(warnedAt)

    // Elle reçoit l'e-mail, se connecte cinq jours plus tard (une session dure 7 jours) et ouvre
    // l'appli.
    const back = plus(warnedAt, 5 * DAY)
    vi.setSystemTime(back)
    const cookie = await act.signInAgain(lea)
    expect((await act.send('GET', '/v1/me', cookie)).status).toBe(200)

    const result = await runAt(plus(THREE_YEARS, 40 * DAY))

    expect(result).toEqual({ warned: 0, deleted: 0 })
    expect(await accountOf(lea.id)).toEqual({ lastActiveAt: back, inactiveNoticeAt: null })
  })

  // S-C2 : l'activité est relue juste avant la première étape de la suppression. Léa revient
  // pendant le passage de la tâche, après la lecture des comptes à traiter : sa visite est jouée
  // pendant l'envoi de l'e-mail de Max et pendant l'effacement des fichiers de Zoé (un autre
  // membre que celui qu'on traite, charte de l'API), pour ne pas dépendre de l'ordre des deux
  // étapes de la tâche. Léa a la visite la plus récente des comptes à supprimer : dans l'ordre de
  // l'index (last_active_at), elle passe après Zoé.
  it('skips an account active since the batch started', async () => {
    const lea = await member('Léa', '198.51.100.1')
    const max = await member('Max', '198.51.100.2')
    const zoe = await member('Zoé', '198.51.100.3')
    const avatar = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: zoe.cookie },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(avatar.status).toBe(200)
    const now = plus(THREE_YEARS, 40 * DAY)
    const warned = plus(now, -31 * DAY)
    await setActivity(zoe.id, plus(LAST_VISIT, -DAY), warned)
    await setActivity(lea.id, LAST_VISIT, warned)
    // Max : 3 ans moins 28 jours sans visite, à prévenir pendant ce passage.
    await setActivity(max.id, plus(now, -(3 * 365 - 28) * DAY))

    let visited = false
    const leaComesBack = async () => {
      if (visited) return
      visited = true
      // Ce que note sa visite (account/activity.ts) : la date, et l'avertissement effacé.
      await setActivity(lea.id, now, null)
    }
    const mailer: Mailer = {
      async send(email) {
        if (email.to === max.email) await leaComesBack()
        await ctx.mailer.send(email)
      },
    }
    const storage: FileStorage = {
      put: (key, data) => ctx.storage.put(key, data),
      get: (key) => ctx.storage.get(key),
      async delete(key) {
        await leaComesBack()
        await ctx.storage.delete(key)
      },
    }

    const result = await runAt(now, { mailer, storage })

    // Témoins : la visite a bien eu lieu pendant le passage, Zoé est partie, Max est prévenu.
    expect(visited).toBe(true)
    expect(await accountOf(zoe.id)).toBeNull()
    expect(warningsTo(max.email)).toHaveLength(1)
    expect(result).toEqual({ warned: 1, deleted: 1 })
    expect(await accountOf(lea.id)).toEqual({ lastActiveAt: now, inactiveNoticeAt: null })
  })

  it('never touches an account active less than 3 years ago', async () => {
    const lea = await member('Léa', '198.51.100.1')
    const max = await member('Max', '198.51.100.2')
    // Un avertissement noté (une sauvegarde restaurée, S-C1), mais une visite il y a deux ans.
    const now = plus(THREE_YEARS, 40 * DAY)
    await setActivity(lea.id, yearsAfter(LAST_VISIT, 1), plus(now, -31 * DAY))
    // Témoin : Max, inactif depuis 3 ans et prévenu depuis 31 jours, part au même passage.
    await setActivity(max.id, LAST_VISIT, plus(now, -31 * DAY))

    const result = await runAt(now)

    expect(result).toEqual({ warned: 0, deleted: 1 })
    expect(await accountOf(max.id)).toBeNull()
    expect(await accountOf(lea.id)).not.toBeNull()
  })
})

// ─── Les mêmes effets que « Supprimer mon compte » ───────────────────────────────────────────────
// S-C2 : une seule liste d'étapes (account/delete.ts) pour Better Auth et pour la tâche. Chaque
// test reprend un effet déjà vérifié pour POST /api/auth/delete-user (accounts.test.ts,
// hives.*.test.ts, suspension.test.ts), cette fois par la tâche. Léa est inactive depuis 3 ans et
// prévenue depuis 31 jours ; les autres membres viennent de passer.

describe('deleting an inactive account like a deletion by the member', () => {
  const NOW = plus(THREE_YEARS, 40 * DAY)

  let lea: Member
  let max: Member

  beforeEach(async () => {
    lea = await member('Léa', '198.51.100.1')
    max = await member('Max', '198.51.100.2')
  })

  /** Pose l'inactivité de Léa et l'activité des autres, puis lance la tâche. */
  const deleteLeaByTheJob = async (others: Member[] = [max]) => {
    await setActivity(lea.id, LAST_VISIT, plus(NOW, -31 * DAY))
    for (const other of others) await setActivity(other.id, NOW)
    const result = await runAt(NOW)
    expect(result).toEqual({ warned: 0, deleted: 1 })
    expect(await accountOf(lea.id)).toBeNull()
  }

  it('writes Account deleted with the identifier, and nothing else about the account', async () => {
    await setActivity(lea.id, LAST_VISIT, plus(NOW, -31 * DAY))
    await setActivity(max.id, NOW)

    const logs = await logsDuring(() => runAt(NOW))

    expect(logs).toContain(`Account deleted ${lea.id}`)
    expect(logs.join('\n')).not.toContain(lea.email)
    expect(logs.join('\n')).not.toContain('"name":"Léa"')
  })

  it('erases her files: the photo of her profile and those of her projects', async () => {
    const upload = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: lea.cookie },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(upload.status).toBe(200)
    const meteo = await act.publish(lea.cookie, 'Météo')
    const visual = await ctx.request(`/v1/projects/${meteo.id}/visuals`, {
      method: 'POST',
      headers: { cookie: lea.cookie },
      body: visualForm(await jpegImage(800, 600)),
    })
    expect(visual.status).toBe(201)
    // Témoin : ses fichiers sont là avant le passage (aucun autre membre n'en a).
    expect(ctx.storage.files.size).toBeGreaterThanOrEqual(2)

    await deleteLeaByTheJob()

    expect([...ctx.storage.files.keys()]).toEqual([])
  })

  it('erases her comments, and keeps a comment with replies as a deleted comment', async () => {
    const velo = await act.publish(max.cookie, 'Vélo')
    const alone = await act.comment(velo.id, lea.cookie, 'Un commentaire sans réponse')
    const answered = await act.comment(velo.id, lea.cookie, 'Un commentaire avec une réponse')
    await act.comment(velo.id, max.cookie, 'Merci Léa', answered.id)

    await deleteLeaByTheJob()

    const rows = await ctx.db
      .select({
        id: schema.projectComment.id,
        authorId: schema.projectComment.authorId,
        deletedAt: schema.projectComment.deletedAt,
      })
      .from(schema.projectComment)
    expect(rows.find((row) => row.id === alone.id)).toBeUndefined()
    expect(rows.find((row) => row.id === answered.id)).toEqual(
      expect.objectContaining({ authorId: null, deletedAt: expect.any(Date) }),
    )
    expect(rows.filter((row) => row.authorId === max.id)).toHaveLength(1)
  })

  it('leaves her hives: the oldest member animates, a hive left empty is deleted', async () => {
    const hives = hiveGestures(ctx, act)
    const famille = await hives.create(lea.cookie, 'Famille')
    const atelier = await hives.create(lea.cookie, 'Atelier')
    await hives.invite(famille.id, lea.cookie, max.id)
    await hives.accept((await hives.invitationTo(famille.id, max.cookie)).id, max.cookie)

    await deleteLeaByTheJob()

    expect((await hiveRow(ctx.db, famille.id))?.animatorId).toBe(max.id)
    expect(await hiveRow(ctx.db, atelier.id)).toBeNull()
  })

  it('voids the open reports on her contents, and keeps those she made without her name', async () => {
    const meteo = await act.publish(lea.cookie, 'Météo')
    const velo = await act.publish(max.cookie, 'Vélo')
    await act.report(max.cookie, { kind: 'project', id: meteo.id })
    await act.report(lea.cookie, { kind: 'project', id: velo.id }, 'scam_spam', 'Une arnaque.')

    await deleteLeaByTheJob()

    const rows = await ctx.db.select().from(schema.contentReport)
    expect(
      Object.fromEntries(rows.map((r) => [r.targetId, [r.status, r.targetAuthorId, r.reporterId]])),
    ).toEqual({
      [meteo.id]: ['void', null, max.id],
      [velo.id]: ['open', max.id, null],
    })
  })

  it('closes her suspension at the time of the deletion', async () => {
    const louis = await member('Louis', '198.51.100.9')
    await act.makeAdmin(louis.id)
    await act.decide(louis.cookie, {
      action: 'suspend',
      memberId: lea.id,
      duration: 'indefinite',
      ground: 'rules',
      explanation: 'Des messages insultants envoyés à plusieurs membres.',
      password: louis.password,
    })

    await deleteLeaByTheJob([max, louis])

    const suspensions = await ctx.db.select().from(schema.accountSuspension)
    expect(suspensions).toEqual([expect.objectContaining({ userId: null, liftedAt: NOW })])
  })

  it('removes the counters that carry her identifier', async () => {
    await act.publish(lea.cookie, 'Météo')
    await act.followMember(max.id, lea.cookie)
    const counters = async () =>
      (await ctx.db.select({ key: schema.apiRateLimit.key }).from(schema.apiRateLimit))
        .map(({ key }) => key)
        .filter((key) => key.includes(lea.id))
    // Témoin : ses compteurs existent avant le passage.
    expect((await counters()).length).toBeGreaterThan(0)

    await deleteLeaByTheJob()

    expect(await counters()).toEqual([])
  })

  it('takes her sessions with the account', async () => {
    await deleteLeaByTheJob()

    expect(
      await ctx.db.select().from(schema.session).where(eq(schema.session.userId, lea.id)),
    ).toEqual([])
    // Témoin : celles de Max restent.
    expect(
      (await ctx.db.select().from(schema.session).where(eq(schema.session.userId, max.id))).length,
    ).toBeGreaterThan(0)
  })
})
