// Les gestes des ruches (R10) dont ont besoin les tests de l'API : inscrire un membre, créer une
// ruche, inviter, accepter, refuser, quitter, lire la page, ses membres et la recherche « Inviter ».
// Chaque geste passe par l'API, comme dans l'appli, et vérifie son statut : un geste qui échoue dit
// lequel (méthode, chemin, statut), au lieu de laisser le test échouer plus loin sans qu'on sache
// pourquoi. Seul `fill` écrit en base : remplir une ruche de 48 membres par l'API demanderait 48
// inscriptions. Rien ici n'est utilisé en production.
import { randomUUID } from 'node:crypto'
import {
  type HiveIcon,
  type HiveInvitation,
  HiveMembers,
  HivePage,
  HiveSummary,
  InvitableMembers,
  MyHives,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import type { activity } from './activity'
import type { TestContext } from './context'

/** Un membre inscrit et vérifié : son cookie de session, son identifiant, de quoi se reconnecter. */
export type TestMember = { cookie: string; id: string; email: string; password: string }

/**
 * Inscrit un membre depuis sa propre adresse IP (`ip`) et ouvre son lien de vérification.
 * `verifiedMember` passe toujours par la même IP : au-delà de six inscriptions, le quota
 * d'inscription par IP répondrait 429 (charte, R3). L'adresse e-mail vient du nom, sans accents :
 * l'inscription refuse « inès@… » (R4).
 */
export const signedUpMember = async (
  ctx: TestContext,
  act: ReturnType<typeof activity>,
  name: string,
  ip: string,
): Promise<TestMember> => {
  const local = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
  const email = `${local}@example.com`
  const password = `${local}-long-password`
  await ctx.signUp({ name, email, password }, { 'x-real-ip': ip })
  const sent = ctx.mailer.sent.findLast((mail) => mail.to === email)
  const link = sent?.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error(`no verification link for ${email}`)
  const url = new URL(link)
  const cookie = ctx.cookiesFrom(await ctx.request(url.pathname + url.search))
  return { cookie, id: (await act.me(cookie)).id, email, password }
}

export const hiveGestures = (ctx: TestContext, act: ReturnType<typeof activity>) => {
  const expectStatus = async (
    status: number,
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ) => {
    const res = await act.send(method, path, cookie, body)
    if (res.status !== status) {
      throw new Error(`${method} ${path}: ${res.status} instead of ${status}`)
    }
    return res
  }

  /** GET /v1/hives : ses ruches, ses invitations valables, le nombre de ruches qu'il a créées. */
  const mine = async (cookie: string) =>
    MyHives.parse(await (await expectStatus(200, 'GET', '/v1/hives', cookie)).json())

  /** L'invitation reçue dans cette ruche, telle que l'onglet Ruches la montre. */
  const invitationTo = async (hiveId: string, cookie: string): Promise<HiveInvitation> => {
    const found = (await mine(cookie)).invitations.find((one) => one.hive.id === hiveId)
    if (!found) throw new Error(`no invitation to the hive ${hiveId}`)
    return found
  }

  const invite = async (hiveId: string, cookie: string, userId: string) => {
    // 201 sans corps (« Réponses des écritures », assemblage du 14/11/2026).
    await expectStatus(201, 'POST', `/v1/hives/${hiveId}/invitations`, cookie, { userId })
  }

  const accept = async (invitationId: string, cookie: string) =>
    HiveSummary.parse(
      await (
        await expectStatus(200, 'POST', `/v1/hive-invitations/${invitationId}/accept`, cookie)
      ).json(),
    )

  return {
    expectStatus,
    mine,
    invitationTo,
    invite,
    accept,

    /** Crée une ruche (POST /v1/hives → 201 `HiveSummary`). */
    create: async (cookie: string, name = 'Famille', icon: HiveIcon = 'house-line') =>
      HiveSummary.parse(
        await (await expectStatus(201, 'POST', '/v1/hives', cookie, { name, icon })).json(),
      ),

    /** La page de la ruche (GET /v1/hives/{id}), qui note aussi la visite. */
    page: async (hiveId: string, cookie: string) =>
      HivePage.parse(await (await expectStatus(200, 'GET', `/v1/hives/${hiveId}`, cookie)).json()),

    members: async (hiveId: string, cookie: string) =>
      HiveMembers.parse(
        await (await expectStatus(200, 'GET', `/v1/hives/${hiveId}/members`, cookie)).json(),
      ).members,

    /** La recherche de la feuille « Inviter ». */
    invitable: async (hiveId: string, cookie: string, q: string) =>
      InvitableMembers.parse(
        await (
          await expectStatus(
            200,
            'GET',
            `/v1/hives/${hiveId}/invitable?${new URLSearchParams({ q })}`,
            cookie,
          )
        ).json(),
      ).members,

    /** Refuse une invitation (DELETE /v1/hive-invitations/{id} → 204), sans prévenir personne. */
    refuse: async (invitationId: string, cookie: string) => {
      await expectStatus(204, 'DELETE', `/v1/hive-invitations/${invitationId}`, cookie)
    },

    /** Fait entrer `invitee` dans la ruche : l'invitation de `inviter`, puis « Rejoindre ». */
    join: async (hiveId: string, inviter: string, invitee: TestMember) => {
      await invite(hiveId, inviter, invitee.id)
      return accept((await invitationTo(hiveId, invitee.cookie)).id, invitee.cookie)
    },

    /** Quitter (soi-même) ou retirer (l'animateur) : DELETE /v1/hives/{id}/members/{userId} → 204. */
    removeMember: async (hiveId: string, cookie: string, userId: string) => {
      await expectStatus(
        204,
        'DELETE',
        `/v1/hives/${hiveId}/members/${encodeURIComponent(userId)}`,
        cookie,
      )
    },

    /**
     * Reconnecte ces membres : une session dure 7 jours, et les tests des 30 jours d'une invitation
     * avancent l'horloge au-delà. Le cookie neuf remplace l'ancien dans l'objet du membre.
     */
    signInAgain: async (...members: TestMember[]) => {
      for (const member of members) member.cookie = await act.signInAgain(member)
    },

    /** Publie un projet réservé à la ruche (« Une ruche » dans « Qui peut le voir ? »). */
    publishReserved: (cookie: string, title: string, hiveId: string, body: object = {}) =>
      act.publish(cookie, title, { visibility: 'hive', hiveId, ...body }),

    /**
     * Ajoute en base `count` membres vérifiés à la ruche, sans passer par l'API : seules les
     * limites les lisent (50 places), jamais leur nom ni leur photo.
     */
    fill: async (hiveId: string, count: number) => {
      const now = new Date()
      const users = Array.from({ length: count }, (_, index) => ({
        id: `filler${index}x${randomUUID().slice(0, 8)}`,
        name: `Membre ${index + 1}`,
        email: `filler-${index}-${randomUUID().slice(0, 8)}@example.com`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      }))
      await ctx.db.insert(schema.user).values(users)
      await ctx.db
        .insert(schema.hiveMember)
        .values(users.map((one) => ({ hiveId, userId: one.id, joinedAt: now })))
      return users.map((one) => one.id)
    },
  }
}
