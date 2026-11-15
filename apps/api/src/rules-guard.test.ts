// Tests d'intégration de la tranche R11 (la conformité) : la garde de l'accord aux règles. Un membre
// qui n'a pas accepté la version en vigueur (inscrit avant R11, ou avant une nouvelle version) lit
// tout, mais chaque écriture sous /v1 reçoit 403 `rules_required`, avant le validateur et le quota
// de la route, comme pour la suspension. Restent permis (décision D1 de la relecture du plan) : tout
// GET et HEAD, tout DELETE (retirer ce qui est à soi, J1), et les sorties : accepter (POST
// /v1/me/rules), régler ses e-mails, se désinscrire par le lien d'un e-mail ; supprimer son compte
// et se déconnecter passent par /api/auth, hors de la garde. Scénario : docs/scenarios/refonte.md,
// « R11 — La conformité », « Les membres déjà inscrits, et chaque nouvelle version » ; relecture de
// sécurité du plan (S-B1, « Vérifié sans problème ») et juridique (J1).
//
// Un « inscrit d'avant » se fabrique en effaçant ses accords en base : aucune route ne retire un
// accord. Karim est ce membre ; Léa, qui a accepté, sert de témoin.
//
// L'inventaire route par route (chaque route, refusée ou permise) est dans route-inventory.test.ts.
import { ErrorResponse, Me, RULES_VERSION, TesterMessage } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, TEST_AUTH_SECRET, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let karim: string // cookies de session
let lea: string
let louis: string
let karimId: string
let leaId: string
let louisId: string
let leaProject: string // le projet de Léa, testable
let karimProject: string // le projet de Karim
let karimComment: string // son commentaire sous le projet de Léa
let karimMessage: string // son retour de testeur, dans le coin du projet de Léa

const START = new Date('2026-11-16T08:00:00.000Z')
const MINUTE = 60 * 1000
const fr = resources.fr.translation

const KARIM = { name: 'Karim', email: 'karim@example.com', password: 'karim-long-password' }
const ACCEPT = { version: RULES_VERSION, acceptRules: true, ageDeclared: true }
const OLDER_VERSION = '2025-06-01'

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

/**
 * Efface les accords d'un membre en base, comme pour un compte créé avant R11. Avec `older`, il
 * garde l'accord d'une version plus ancienne : il retrouve l'écran à la nouvelle version.
 */
const forgetAcceptances = async (userId: string, older = false) => {
  await ctx.db.delete(schema.rulesAcceptance).where(eq(schema.rulesAcceptance.userId, userId))
  if (older) {
    await ctx.db.insert(schema.rulesAcceptance).values({
      userId,
      version: OLDER_VERSION,
      acceptedAt: new Date(START.getTime() - 60 * MINUTE),
      ageDeclared: true,
    })
  }
}

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  karim = await ctx.verifiedMember(KARIM)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  karimId = (await act.me(karim)).id
  leaId = (await act.me(lea)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)

  // Ce que Karim a fait avant la nouvelle version, tant qu'il avait accepté : un projet, un
  // commentaire, une réaction et un suivi chez Léa, un retour de testeur dans son coin.
  later()
  leaProject = (
    await act.publish(lea, 'Décollage !', {
      status: 'testable',
      demoUrl: 'https://demo.example.com/',
    })
  ).id
  later()
  karimProject = (await act.publish(karim, 'Le carnet de Karim')).id
  later()
  karimComment = (await act.comment(leaProject, karim, 'Bravo, très réussi.')).id
  await act.react(leaProject, 'bravo', karim)
  later()
  expect((await act.send('POST', `/v1/projects/${leaProject}/follow`, karim)).status).toBe(204)
  later()
  expect((await act.send('POST', `/v1/projects/${leaProject}/testers`, karim)).status).toBe(204)
  later()
  const message = await act.send(
    'POST',
    `/v1/projects/${leaProject}/threads/${karimId}/messages`,
    karim,
    {
      kind: 'feedback',
      outcome: 'partly',
      device: 'phone',
      text: 'Le score repart à zéro au niveau 3.',
      captureId: null,
    },
  )
  expect(message.status).toBe(201)
  karimMessage = TesterMessage.parse(await message.json()).id

  // Puis une nouvelle version des règles : Karim ne l'a pas encore acceptée.
  await forgetAcceptances(karimId)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** 403 `rules_required`, avec le message dans la langue du membre (le français par défaut). */
const expectRulesRequired = async (res: Response, what = '') => {
  expect(res.status, what).toBe(403)
  const body = ErrorResponse.parse(await res.json())
  expect(body.error.code, what).toBe('rules_required')
  expect(body.error.message, what).toBe(fill(fr.errors.rulesRequired))
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

describe('the guard of the rules', () => {
  it('refuses every write of a member without the current rules with 403 rules_required, before the validator and the quota', async () => {
    // Tous les compteurs de Karim au plafond : une route qui compterait avant la garde répondrait
    // 429, pas 403. Les corps sont invalides : un validateur avant la garde répondrait 400. Les
    // compteurs déjà ouverts par ses gestes d'avant passent eux aussi au plafond.
    await ctx.db
      .insert(schema.apiRateLimit)
      .values(
        Object.values(memberCounterKeys(karimId)).map((key) => ({
          key,
          count: 1_000_000,
          windowStart: Date.now(),
        })),
      )
      .onConflictDoUpdate({
        target: schema.apiRateLimit.key,
        set: { count: 1_000_000, windowStart: Date.now() },
      })
    const writes: [string, string][] = [
      ['POST', '/v1/projects'],
      ['PATCH', '/v1/me'],
      ['POST', '/v1/me/avatar'],
      ['PATCH', `/v1/projects/${karimProject}`],
      ['POST', `/v1/projects/${leaProject}/comments`],
      ['PUT', `/v1/projects/${leaProject}/reactions/bravo`],
      ['POST', `/v1/members/${leaId}/follow`],
      ['POST', `/v1/projects/${leaProject}/threads/${karimId}/messages`],
      // Des gestes permis à un compte suspendu, mais pas sans l'accord : seules les sorties passent.
      ['POST', '/v1/reports'],
      ['PUT', `/v1/members/${leaId}/block`],
      ['PUT', '/v1/notifications/seen'],
      ['PUT', '/v1/feed/read'],
      ['POST', '/v1/hives'],
    ]
    for (const [method, path] of writes) {
      await expectRulesRequired(await act.send(method, path, karim, 'x'), `${method} ${path}`)
    }

    // Rien n'a été écrit : pas de projet de plus, pas de commentaire de plus.
    const projects = await ctx.db
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(eq(schema.project.authorId, karimId))
    expect(projects).toHaveLength(1)
    // Témoin : Léa, qui a accepté, reçoit l'erreur de validation de la route.
    expect((await act.send('POST', '/v1/projects', lea, 'x')).status).toBe(400)
  })

  it('refuses a member who accepted only an older version', async () => {
    await forgetAcceptances(leaId, true)

    await expectRulesRequired(
      await act.send('POST', `/v1/projects/${leaProject}/comments`, lea, { body: 'Merci !' }),
    )
    // Témoin : Louis, qui a accepté la version en vigueur, commente.
    expect(
      (await act.send('POST', `/v1/projects/${leaProject}/comments`, louis, { body: 'Super.' }))
        .status,
    ).toBe(201)
  })

  it('lets him read everything, with GET and HEAD', async () => {
    const me = await act.send('GET', '/v1/me', karim)
    expect(me.status).toBe(200)
    expect(Me.parse(await me.json()).rulesAccepted).toBe(false)
    expect((await act.send('GET', `/v1/projects/${leaProject}`, karim)).status).toBe(200)
    expect((await act.send('GET', `/v1/projects/${leaProject}/comments`, karim)).status).toBe(200)
    expect((await act.send('GET', '/v1/feed/following', karim)).status).toBe(200)
    expect((await act.send('GET', '/v1/notifications', karim)).status).toBe(200)
    expect((await act.send('HEAD', '/v1/me', karim)).status).toBe(200)
    // Témoin : la garde vise bien Karim, ses écritures sont refusées.
    await expectRulesRequired(await act.send('POST', '/v1/projects', karim, 'x'))
  })

  // Décision D1 de la relecture du plan : tout DELETE passe, comme pour la suspension.
  it('lets him take back what is his without accepting: a reaction, a follow, his project', async () => {
    // Témoin d'abord : la garde vise bien Karim.
    await expectRulesRequired(
      await act.send('PUT', `/v1/projects/${leaProject}/reactions/bravo`, karim),
    )

    expect(
      (await act.send('DELETE', `/v1/projects/${leaProject}/reactions/bravo`, karim)).status,
    ).toBe(204)
    expect((await act.send('DELETE', `/v1/projects/${leaProject}/follow`, karim)).status).toBe(204)
    expect((await act.send('DELETE', `/v1/projects/${leaProject}/testers`, karim)).status).toBe(204)
    expect((await act.send('DELETE', `/v1/projects/${karimProject}`, karim)).status).toBe(204)
  })

  // Relecture juridique J1 : retirer un commentaire ou un retour ne demande pas d'accepter.
  it('lets him delete his comment and his tester message without accepting', async () => {
    // Témoin d'abord : un nouveau commentaire est refusé.
    await expectRulesRequired(
      await act.send('POST', `/v1/projects/${leaProject}/comments`, karim, { body: 'Encore !' }),
    )

    const comment = await act.send(
      'DELETE',
      `/v1/projects/${leaProject}/comments/${karimComment}`,
      karim,
    )
    expect(comment.status).toBe(204)
    const message = await act.send(
      'DELETE',
      `/v1/projects/${leaProject}/messages/${karimMessage}`,
      karim,
    )
    expect(message.status).toBe(204)

    // Le commentaire a bien disparu du fil du projet, pour Léa comme pour tous.
    const thread = await act.send('GET', `/v1/projects/${leaProject}/comments`, lea)
    expect(thread.status).toBe(200)
    expect(await thread.text()).not.toContain('Bravo, très réussi.')
  })

  // J1, depuis « Mes commentaires » (/settings/data/comments, ouverte sans l'accord) : la route
  // neuve DELETE /v1/me/comments/{commentId} est un DELETE, permise comme les autres.
  it('lets him delete his comment from « My comments » without accepting', async () => {
    await expectRulesRequired(
      await act.send('POST', `/v1/projects/${leaProject}/comments`, karim, { body: 'Encore !' }),
    )

    const res = await act.send('DELETE', `/v1/me/comments/${karimComment}`, karim)
    expect(res.status).toBe(204)
  })

  it('lets him set his e-mails, unsubscribe, export, sign out and delete his account without accepting', async () => {
    // Témoin d'abord : la garde vise bien Karim.
    await expectRulesRequired(await act.send('PATCH', '/v1/me', karim, { language: 'en' }))

    expect(
      (await act.send('PATCH', '/v1/me/email-preferences', karim, { weeklyRecap: false })).status,
    ).toBe(200)
    const token = createUnsubscribeToken(TEST_AUTH_SECRET, karimId, 'recap')
    const unsubscribe = await ctx.request(
      `/v1/email/unsubscribe?${new URLSearchParams({ token })}`,
      { method: 'POST', headers: { cookie: karim } },
    )
    expect(unsubscribe.status).toBe(204)
    expect((await act.send('GET', '/v1/me/export', karim)).status).toBe(200)
    // Se déconnecter et supprimer son compte passent par Better Auth (/api/auth), hors de la garde.
    expect((await act.send('POST', '/api/auth/sign-out', karim, {})).status).toBe(200)
    const again = await act.signInAgain(KARIM)
    await act.deleteAccount(again, KARIM.password)
    const left = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, karimId))
    expect(left).toEqual([])
  })

  it('lets him write again once he has accepted', async () => {
    await expectRulesRequired(
      await act.send('POST', `/v1/projects/${leaProject}/comments`, karim, { body: 'Merci !' }),
    )

    expect((await act.send('POST', '/v1/me/rules', karim, ACCEPT)).status).toBe(200)

    expect(
      (await act.send('POST', `/v1/projects/${leaProject}/comments`, karim, { body: 'Merci !' }))
        .status,
    ).toBe(201)
  })

  // Relecture de sécurité (« Vérifié sans problème ») : la garde compare la route trouvée par Hono,
  // jamais le début de l'adresse demandée.
  it('refuses /v1/me/rulesX and the other addresses that only begin like the accepting one', async () => {
    for (const path of [
      '/v1/me/rulesX',
      '/v1/me/rules/x',
      '/v1/me/rules/me',
      '/v1/me/rulesrules',
    ]) {
      await expectRulesRequired(await act.send('POST', path, karim, ACCEPT), path)
    }
    // Les autres méthodes sur l'adresse d'accepter ne sont pas des sorties non plus.
    await expectRulesRequired(await act.send('PUT', '/v1/me/rules', karim, ACCEPT), 'PUT')
    await expectRulesRequired(await act.send('PATCH', '/v1/me/rules', karim, ACCEPT), 'PATCH')
    expect((await act.me(karim)).rulesAccepted).toBe(false)
    // Témoin : la vraie route accepte.
    expect((await act.send('POST', '/v1/me/rules', karim, ACCEPT)).status).toBe(200)
  })

  it('refuses an unknown address with 403 rules_required, not 404', async () => {
    await expectRulesRequired(await act.send('POST', '/v1/zz-unknown', karim, {}))
    await expectRulesRequired(await act.send('PUT', '/v1/me/zz-unknown', karim, {}))
    // Témoin : Léa, qui a accepté, reçoit le 404 d'une adresse inconnue.
    expect((await act.send('POST', '/v1/zz-unknown', lea, {})).status).toBe(404)
  })

  it('refuses the writes of moderation to an admin without the current rules, and lets him read it', async () => {
    await forgetAcceptances(louisId)
    const decision = {
      action: 'suspend',
      memberId: leaId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    }

    await expectRulesRequired(await act.send('POST', '/v1/moderation/decisions', louis, decision))
    await expectRulesRequired(
      await act.send('POST', '/v1/moderation/tools', louis, { name: 'Mistral' }),
    )
    expect((await act.send('GET', '/v1/moderation/reports', louis)).status).toBe(200)
    // Rien n'a été décidé : Léa écrit toujours.
    expect(
      (await act.send('POST', `/v1/projects/${leaProject}/comments`, lea, { body: 'Merci !' }))
        .status,
    ).toBe(201)

    // Témoin : une fois les règles acceptées, la même décision passe.
    expect((await act.send('POST', '/v1/me/rules', louis, ACCEPT)).status).toBe(200)
    later()
    expect((await act.send('POST', '/v1/moderation/decisions', louis, decision)).status).toBe(201)
  })

  // Relecture de sécurité du plan, S-B1 (bloquant) : POST /v1/me/rules entre dans les écritures
  // permises à un compte suspendu (suspension/guard.ts) ; accepter ne rend pas l'écriture.
  it('lets a suspended member accept the current rules, then still refuses his writes', async () => {
    const suspended = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'suspend',
      memberId: karimId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })
    expect(suspended.status).toBe(201)
    later()
    // La garde de la suspension passe la première : avant d'accepter, le refus est celui-là.
    await expectError(await act.send('POST', '/v1/projects', karim, 'x'), 403, 'suspended')

    const res = await act.send('POST', '/v1/me/rules', karim, ACCEPT)

    expect(res.status).toBe(200)
    expect(Me.parse(await res.json()).rulesAccepted).toBe(true)
    await expectError(await act.send('POST', '/v1/projects', karim, 'x'), 403, 'suspended')
    await expectError(
      await act.send('POST', `/v1/projects/${leaProject}/comments`, karim, { body: 'Merci !' }),
      403,
      'suspended',
    )
  })

  it('changes nothing for a visitor without a session: 401, as before', async () => {
    await expectError(await act.send('POST', '/v1/projects', null, {}), 401, 'unauthorized')
    // Témoin : Karim, connecté et sans l'accord, reçoit le refus de la garde.
    await expectRulesRequired(await act.send('POST', '/v1/projects', karim, {}))
  })
})
