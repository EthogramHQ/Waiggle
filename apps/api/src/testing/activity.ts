// Les gestes des membres dont ont besoin les tests des e-mails de notification (tranche 6c) :
// publier un projet, commenter, répondre, réagir, suivre, ouvrir l'écran des notifications,
// régler ses e-mails. Chaque geste passe par l'API, comme dans l'appli : les tâches (récap,
// e-mails de mentions) lisent ensuite ce que la base en a gardé. Rien ici n'est utilisé en
// production.
//
// Un geste qui échoue lève une erreur qui dit lequel (la méthode, le chemin, le statut) : le test
// s'arrête là, au lieu d'échouer plus loin sur un e-mail manquant sans qu'on sache pourquoi.
// Les tests espacent eux-mêmes les gestes (fausse horloge, `later()`).
import {
  Comment,
  CreatedReport,
  EmailPreferences,
  Me,
  ModerationDecision,
  type ModerationDecisionInput,
  NotificationPage,
  Project,
  type ReportReason,
  type ReportTarget,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import type { TestContext } from './context'

export const activity = (ctx: TestContext) => {
  /** Une requête de l'appli, avec la session de `cookie` (aucune si null) et un corps JSON. */
  const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
    ctx.request(path, {
      method,
      headers: {
        ...(cookie && { cookie }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  /** Comme `send`, mais vérifie le statut attendu et rend la réponse. */
  const expectStatus = async (
    status: number,
    method: string,
    path: string,
    cookie: string | null,
    body?: unknown,
  ) => {
    const res = await send(method, path, cookie, body)
    if (res.status !== status) {
      throw new Error(`${method} ${path}: ${res.status} instead of ${status}`)
    }
    return res
  }

  return {
    send,

    me: async (cookie: string) =>
      Me.parse(await (await expectStatus(200, 'GET', '/v1/me', cookie)).json()),

    /** Change son nom, sa langue ou son pseudo (PATCH /v1/me). */
    updateProfile: async (cookie: string, body: object) => {
      await expectStatus(200, 'PATCH', '/v1/me', cookie, body)
    },

    /** Publie un projet (public par défaut). */
    publish: async (cookie: string, title: string, body: object = {}) =>
      Project.parse(
        await (
          await expectStatus(201, 'POST', '/v1/projects', cookie, {
            title,
            pitch: 'Un petit projet pour essayer.',
            ...body,
          })
        ).json(),
      ),

    setVisibility: async (projectId: string, cookie: string, visibility: 'public' | 'private') => {
      await expectStatus(200, 'PATCH', `/v1/projects/${projectId}`, cookie, { visibility })
    },

    /** Publie un commentaire, ou une réponse si `replyTo` est donné. */
    comment: async (projectId: string, cookie: string, body: string, replyTo?: string) =>
      Comment.parse(
        await (
          await expectStatus(
            201,
            'POST',
            `/v1/projects/${projectId}/comments`,
            cookie,
            replyTo === undefined ? { body } : { body, replyTo },
          )
        ).json(),
      ),

    deleteComment: async (projectId: string, commentId: string, cookie: string) => {
      await expectStatus(204, 'DELETE', `/v1/projects/${projectId}/comments/${commentId}`, cookie)
    },

    /** L'auteur du projet masque un commentaire. */
    hide: async (projectId: string, commentId: string, cookie: string) => {
      await expectStatus(204, 'PUT', `/v1/projects/${projectId}/comments/${commentId}/hide`, cookie)
    },

    react: async (projectId: string, kind: string, cookie: string) => {
      await expectStatus(204, 'PUT', `/v1/projects/${projectId}/reactions/${kind}`, cookie)
    },

    followMember: async (memberId: string, cookie: string) => {
      await expectStatus(204, 'POST', `/v1/members/${memberId}/follow`, cookie)
    },

    /** Ouvre l'écran des notifications, comme l'appli : lit la liste, puis marque vu jusqu'à son heure. */
    openNotifications: async (cookie: string) => {
      const page = NotificationPage.parse(
        await (await expectStatus(200, 'GET', '/v1/notifications', cookie)).json(),
      )
      await expectStatus(204, 'PUT', '/v1/notifications/seen', cookie, { upTo: page.asOf })
    },

    /** Lit ses réglages d'e-mail. */
    preferences: async (cookie: string) =>
      EmailPreferences.parse(
        await (await expectStatus(200, 'GET', '/v1/me/email-preferences', cookie)).json(),
      ),

    /** Change ses réglages d'e-mail (Mon profil, section « E-mails »). */
    setPreferences: async (cookie: string, body: object) =>
      EmailPreferences.parse(
        await (await expectStatus(200, 'PATCH', '/v1/me/email-preferences', cookie, body)).json(),
      ),

    /** Se reconnecte : une session dure 7 jours, et certains tests avancent l'horloge de semaines. */
    signInAgain: async (account: { email: string; password: string }) => {
      const res = await ctx.signIn(account)
      if (res.status !== 200) throw new Error(`sign-in: ${res.status}`)
      return ctx.cookiesFrom(res)
    },

    /** Supprime son compte, mot de passe confirmé (Mon compte). */
    deleteAccount: async (cookie: string, password: string) => {
      await expectStatus(200, 'POST', '/api/auth/delete-user', cookie, { password })
    },

    // ─── Signaler et modérer (tranche 6d) ───────────────────────────────────────────────────────

    /** Signale une cible (POST /v1/reports), avec un motif et une précision facultative. */
    report: async (
      cookie: string,
      target: ReportTarget,
      reason: ReportReason = 'other',
      details?: string,
    ) =>
      CreatedReport.parse(
        await (
          await expectStatus(201, 'POST', '/v1/reports', cookie, {
            target,
            reason,
            ...(details !== undefined && { details }),
          })
        ).json(),
      ),

    /**
     * Un administrateur décide (POST /v1/moderation/decisions) : retirer, classer ou rétablir.
     * 201 : la décision est une ressource créée, comme un signalement.
     */
    decide: async (cookie: string, decision: ModerationDecisionInput) =>
      ModerationDecision.parse(
        await (
          await expectStatus(201, 'POST', '/v1/moderation/decisions', cookie, decision)
        ).json(),
      ),

    /**
     * Fait de ce membre un administrateur. En production, seul le script infra/grant-admin.sh le
     * fait, directement en base : aucune route de l'API ne donne ce rôle. Le test écrit donc lui
     * aussi directement dans la table admin_member.
     */
    makeAdmin: async (userId: string) =>
      await ctx.db.insert(schema.adminMember).values({ userId, grantedAt: new Date() }),

    /** Retire le rôle (grant-admin.sh --revoke) : la ligne reste, datée de sa révocation. */
    revokeAdmin: async (userId: string) =>
      await ctx.db
        .update(schema.adminMember)
        .set({ revokedAt: new Date() })
        .where(eq(schema.adminMember.userId, userId)),
  }
}
