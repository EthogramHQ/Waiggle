// Routes du membre connecté : lire et modifier son profil, changer d'avatar, exporter ses données.
// Toutes exigent d'être connecté.

import { createRoute } from '@hono/zod-openapi'
import { appName } from '@ruche/brand'
import {
  AccountExport,
  AVATAR_MAX_BYTES,
  HANDLE_CHANGES_PER_DAY,
  Me,
  ProfileUpdate,
  ReportOutcome,
  ReportReason,
  StoredReportTargetKind,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireUser } from '../auth/session'
import { blocksOfMember } from '../blocks/list'
import { categoryChangesOf } from '../catalogue/export'
import { commentsOfAuthor } from '../comments/load'
import { exportEmailPreferences } from '../email/preferences'
import { errorBody, languageOf } from '../errors'
import { readFeedReadAt } from '../feed/state'
import { claimHandle, HandleTakenError } from '../handles/claim'
import { currentHandle, formerHandleOf } from '../handles/load'
import { processAvatar } from '../media/avatar'
import type { FileStorage } from '../media/storage'
import { mentionsOfComments } from '../mentions/load'
import { readSeenAt } from '../notifications/state'
import { loadMe } from '../profile/me'
import { loadProjectsOf } from '../projects/load'
import { listedProject, listedProjectFor } from '../projects/visibility'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { reactionsOfMember } from '../reactions/load'
import { dismissedSuggestionsOf } from '../suggestions/load'
import { isSuspended, suspensionsOfMember } from '../suspension/load'
import { chargeOtherTools } from '../tools/quota'
import { countChargedOtherTools, NoFreeToolSlugError, resolveTools } from '../tools/resolve'
import { replaceProfileTools } from '../tools/write'
import type { AppEnv } from '../types'
import { updatesOfAuthor } from '../updates/load'
import { createRouter, errorResponse } from './router'

// Règles anti-abus de ces routes (voir docs/scenarios/phase-1.md, tranche 2).
const HOUR = 60 * 60 * 1000
const profileRule: RateRule = { windowMs: HOUR, max: 30 }
const avatarRule: RateRule = { windowMs: HOUR, max: 10 }
// Changer de pseudo (tranche 6a) : 5 fois par 24 heures, en plus du quota du profil.
const handleRule: RateRule = { windowMs: 24 * HOUR, max: HANDLE_CHANGES_PER_DAY }
// L'export de ses données lit tout ce que le membre a écrit (projets, notes, commentaires…) : une
// quinzaine de requêtes. 30 par heure laissent largement de quoi s'en servir, mais empêchent une
// session volée, ou un script en boucle, d'occuper la base à le redemander sans fin.
const exportRule: RateRule = { windowMs: HOUR, max: 30 }

const meResponse = { description: 'The profile.', content: { 'application/json': { schema: Me } } }

const meRoute = createRoute({
  method: 'get',
  path: '/v1/me',
  summary: 'The signed-in member',
  responses: { 200: meResponse, 401: errorResponse('Not signed in.') },
})

const updateMeRoute = createRoute({
  method: 'patch',
  path: '/v1/me',
  summary: 'Update my profile and language',
  // La requête doit respecter ProfileUpdate ; sinon le routeur répond 400 avant même la route.
  // required: true : un corps JSON est obligatoire. Sans cette option, une requête envoyée dans un
  // autre format (text/plain…) passait sans être vérifiée.
  request: {
    body: { required: true, content: { 'application/json': { schema: ProfileUpdate } } },
  },
  responses: {
    200: meResponse,
    400: errorResponse('Invalid data.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A suspended account may only change its language.'),
    409: errorResponse('Handle already taken, or still reserved for its former owner.'),
    429: errorResponse('Too many changes.'),
  },
})

const avatarRoute = createRoute({
  method: 'post',
  path: '/v1/me/avatar',
  summary: 'Upload my avatar',
  description:
    'multipart/form-data with an "avatar" file (JPEG, PNG or WebP, 5 MB at most). ' +
    'The image is re-encoded to a 512 px WebP square without metadata.',
  responses: {
    200: meResponse,
    400: errorResponse('No file.'),
    401: errorResponse('Not signed in.'),
    413: errorResponse('File too large.'),
    415: errorResponse('Not a JPEG, PNG or WebP image.'),
    429: errorResponse('Too many uploads.'),
    503: errorResponse('Too many images being processed; retry later.'),
  },
})

const exportRoute = createRoute({
  method: 'get',
  path: '/v1/me/export',
  summary: 'Download all my data (GDPR right of access)',
  responses: {
    200: {
      description: 'Everything the app stores about the member, without secrets.',
      content: { 'application/json': { schema: AccountExport } },
    },
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many exports.'),
  },
})

type Deps = {
  db: Database
  storage: FileStorage
  limiter: RateLimiter
  publicApiUrl: string
}

export const meRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Toutes ces routes exigent un membre connecté. Ce contrôle passe en premier, avant la lecture
  // du corps de la requête (vérification du JSON, limite de taille de l'avatar…).
  app.use('/v1/me', requireUser)
  app.use('/v1/me/*', requireUser)

  // Réponses d'erreur courantes, dans la langue du visiteur.
  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  // `code` : « rate_limited » par défaut ; « handle_change_limit » pour le quota des pseudos, dont
  // le message dit au membre qu'il pourra changer de pseudo demain (et non « trop de demandes »).
  const tooMany = (
    c: Context<AppEnv>,
    retryAfterSeconds: number,
    code: 'rate_limited' | 'handle_change_limit' | 'too_many_other_tools' = 'rate_limited',
  ) => {
    // Retry-After : en-tête standard qui dit dans combien de secondes réessayer.
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), code), 429)
  }

  app.openapi(meRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  // Le quota du profil compte AVANT de lire le corps de la demande (audit de sécurité du
  // 25/10/2026, C7, comme routes/notes.ts) : le schéma ProfileUpdate est vérifié par un middleware
  // que Hono place juste avant la route ; ce garde, enregistré plus tôt pour la même adresse et la
  // même méthode, passe avant lui. Chaque demande compte ainsi, même mal écrite.
  app.on('PATCH', '/v1/me', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).profile, profileRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    // Un compte suspendu (tranche 7c, S9) : la garde (suspension/guard.ts) le laisse entrer ici
    // pour changer de langue, et rien d'autre. Toute autre clé du corps, même avec sa valeur
    // actuelle ou null, reçoit 403 `suspended`, avant le validateur et avant toute lecture du
    // pseudo. `c.req.json()` garde le corps lu : le validateur le relit sans le redemander. Un corps
    // qui n'est pas un objet JSON passe : le validateur répond 400, comme à tout membre.
    if (await isSuspended(db, user.id, new Date())) {
      const body: unknown = await c.req.json().catch(() => null)
      const keys = typeof body === 'object' && body !== null ? Object.keys(body) : []
      if (keys.some((key) => key !== 'language')) {
        return c.json(errorBody(languageOf(c), 'suspended'), 403)
      }
    }
    await next()
  })

  app.openapi(updateMeRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande dans le quota de l'heure.

    // c.req.valid('json') : le corps de la requête, déjà vérifié par le schéma ProfileUpdate. Le
    // pseudo y est déjà nettoyé (« @Ines » → « ines ») et de bonne forme.
    const { name, handle, language, bio, favoriteTools } = c.req.valid('json')

    // Un changement de pseudo a son propre quota (5 par jour), compté seulement s'il change :
    // renvoyer son pseudo actuel avec le reste du profil n'en est pas un. Un essai sur un pseudo
    // pris compte aussi : personne ne peut ainsi tester les pseudos sans fin.
    const changesHandle = handle !== undefined && handle !== (await currentHandle(db, user.id))
    if (changesHandle) {
      const handleDecision = await limiter.hit(memberCounterKeys(user.id).handle, handleRule)
      if (!handleDecision.allowed) {
        return tooMany(c, handleDecision.retryAfterSeconds, 'handle_change_limit')
      }
    }

    // Les noms hors catalogue de ses outils favoris se comptent AVANT d'écrire (sec-A5, sec-B1),
    // dans le même quota que ceux de ses projets : trop nombreux, rien de la demande n'est gardé.
    const counted =
      favoriteTools === undefined ? 0 : await countChargedOtherTools(db, user.id, favoriteTools)
    const toolsRetry = await chargeOtherTools(limiter, user.id, counted)
    if (toolsRetry !== null) return tooMany(c, toolsRetry, 'too_many_other_tools')
    let createdHere = 0

    // Tout le profil s'écrit dans une seule transaction : si le pseudo est pris, claimHandle lève
    // HandleTakenError, la transaction est annulée, et rien de la demande n'est enregistré.
    try {
      await db.transaction(async (tx) => {
        if (handle !== undefined) await claimHandle(tx, user.id, handle, new Date())
        // Le nom et la langue sont dans la table `user`…
        if (name !== undefined || language !== undefined) {
          await tx
            .update(schema.user)
            // On n'écrit que ce qui a été envoyé : { name } seulement si name existe, etc.
            .set({
              ...(name !== undefined && { name }),
              ...(language !== undefined && { language }),
            })
            .where(eq(schema.user.id, user.id))
        }
        // … la bio et les outils dans `profile`. « Upsert » : créer la ligne si elle n'existe pas
        // encore, sinon la mettre à jour (insert … on conflict do update).
        if (bio !== undefined || favoriteTools !== undefined) {
          // Les outils favoris (R6b) : reliés au catalogue, écrits dans profile_tool seulement
          // (l'ancienne colonne `favorite_tools` est effacée par la migration 0018).
          const resolved =
            favoriteTools === undefined ? undefined : await resolveTools(tx, favoriteTools)
          // Sans bio envoyée, il ne reste rien à mettre à jour (Drizzle refuse un `set` vide) : la
          // ligne n'est créée que si elle manque.
          const profileInsert = tx
            .insert(schema.profile)
            .values({ userId: user.id, bio: bio ?? '' })
          await (bio === undefined
            ? profileInsert.onConflictDoNothing()
            : profileInsert.onConflictDoUpdate({ target: schema.profile.userId, set: { bio } }))
          if (resolved) {
            createdHere = resolved.created
            await replaceProfileTools(tx, user.id, resolved.tools)
          }
        }
      })
    } catch (error) {
      // Pris par un autre ou réservé : la même réponse, mot pour mot, pour ne pas dire lequel.
      if (error instanceof HandleTakenError) {
        return c.json(errorBody(languageOf(c), 'handle_taken'), 409)
      }
      // sec-B4 : plus d'adresse libre pour un nouvel « Autre » : refusé, rien n'est gardé.
      if (error instanceof NoFreeToolSlugError) {
        return c.json(errorBody(languageOf(c), 'validation'), 400)
      }
      throw error
    }
    // Une création de plus que celles comptées (un nom effacé entre-temps) : comptée après coup.
    if (createdHere > counted) await chargeOtherTools(limiter, user.id, createdHere - counted)

    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  // Avant même de lire le fichier : on coupe tout envoi plus gros que la limite (+ 64 Ko pour
  // l'enveloppe du formulaire). Un envoi géant ne remplira jamais la mémoire du serveur.
  app.use(
    '/v1/me/avatar',
    bodyLimit({
      maxSize: AVATAR_MAX_BYTES + 64 * 1024,
      onError: (c) => c.json(errorBody(languageOf(c), 'payload_too_large'), 413),
    }),
  )

  app.openapi(avatarRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).avatar, avatarRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

    // parseBody lit un formulaire « multipart » : les champs texte et les fichiers.
    const form = await c.req.parseBody()
    const file = form.avatar
    if (!(file instanceof File)) return c.json(errorBody(languageOf(c), 'validation'), 400)
    if (file.size > AVATAR_MAX_BYTES) {
      return c.json(errorBody(languageOf(c), 'payload_too_large'), 413)
    }

    const result = await processAvatar(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok && result.reason === 'busy') {
      // 503 : service momentanément indisponible. Retry-After : réessayer dans 10 secondes.
      c.header('Retry-After', '10')
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    }
    if (!result.ok) return c.json(errorBody(languageOf(c), 'unsupported_media_type'), 415)

    // Nom de fichier tiré au hasard par le serveur : jamais celui envoyé par le membre.
    const key = `avatars/${crypto.randomUUID()}.webp`
    await storage.put(key, result.data)

    // On échange l'ancien avatar contre le nouveau, puis on efface l'ancien fichier.
    // Une « transaction » regroupe plusieurs opérations : elles réussissent toutes, ou aucune.
    // Le verrou (FOR UPDATE) fait patienter un second envoi simultané jusqu'à la fin de celle-ci :
    // sans lui, deux envois liraient le même « ancien » avatar et l'un des nouveaux fichiers
    // resterait orphelin (jamais effacé, même à la suppression du compte).
    let previousKey: string | null
    try {
      previousKey = await db.transaction(async (tx) => {
        // La ligne du profil doit exister pour pouvoir être verrouillée.
        await tx.insert(schema.profile).values({ userId: user.id }).onConflictDoNothing()
        const [row] = await tx
          .select({ avatarKey: schema.profile.avatarKey })
          .from(schema.profile)
          .where(eq(schema.profile.userId, user.id))
          .for('update')
        await tx
          .update(schema.profile)
          .set({ avatarKey: key })
          .where(eq(schema.profile.userId, user.id))
        return row?.avatarKey ?? null
      })
    } catch (error) {
      await storage.delete(key) // la base n'a rien enregistré : le nouveau fichier ne sert à rien
      throw error
    }
    if (previousKey) await storage.delete(previousKey)

    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  app.openapi(exportRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).export, exportRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)

    // On choisit les colonnes une par une (select({...})) : impossible d'exporter par erreur
    // l'empreinte du mot de passe ou un jeton, qui ne sont jamais demandés.
    const loginMethods = await db
      .select({ provider: schema.account.providerId, createdAt: schema.account.createdAt })
      .from(schema.account)
      .where(eq(schema.account.userId, user.id))
    const sessions = await db
      .select({
        createdAt: schema.session.createdAt,
        updatedAt: schema.session.updatedAt,
        expiresAt: schema.session.expiresAt,
        ipAddress: schema.session.ipAddress,
        userAgent: schema.session.userAgent,
      })
      .from(schema.session)
      .where(eq(schema.session.userId, user.id))

    // Tous ses projets, privés compris (c'est lui qui regarde).
    const projects = await loadProjectsOf(db, user.id, user.id, publicApiUrl)
    // Les rangements de catégorie faits par un administrateur sur ses projets (R6b, jur-T4), sans
    // nommer l'administrateur.
    const categoryChanges = await categoryChangesOf(db, user.id)
    // Toutes les mises à jour de ses projets (R7a), privés compris, retirées comprises (avec le
    // retrait), et pas seulement la page de la frise. Jamais celles des projets qu'il suit ou teste :
    // elles appartiennent à leurs auteurs.
    const updates = await updatesOfAuthor(db, user.id)

    // Les projets dont il est testeur (R7a), des plus anciennes inscriptions aux plus récentes :
    // l'identifiant, la date, et le titre seulement si le projet lui est encore visible. Un projet
    // devenu privé, retiré, ou d'un membre bloqué avec lui n'a plus de titre ici (le titre
    // appartient à son auteur ; comme pour les abonnements, sécurité B3). Le `left join` garde la
    // ligne d'inscription même quand sa condition de visibilité (`listedProjectFor`) échoue : le
    // titre vaut alors null. La clé primaire (member_id, project_id) trouve ses inscriptions ; le
    // tri se fait en mémoire (un export est rare, et ne concerne qu'un membre).
    const testerOf = (
      await db
        .select({
          projectId: schema.projectTester.projectId,
          title: schema.project.title,
          since: schema.projectTester.createdAt,
        })
        .from(schema.projectTester)
        .leftJoin(
          schema.project,
          and(eq(schema.project.id, schema.projectTester.projectId), listedProjectFor(user.id)),
        )
        .where(eq(schema.projectTester.memberId, user.id))
        .orderBy(asc(schema.projectTester.createdAt), asc(schema.projectTester.projectId))
    ).map((row) => ({
      projectId: row.projectId,
      title: row.title,
      since: row.since.toISOString(),
    }))

    // Ce qu'il suit : l'identifiant et la date, rien de plus. Ses abonnés, eux, ne font pas partie
    // de ses données. Les deux requêtes partent de la clé primaire (follower_id, …).
    // Un projet suivi devenu privé n'y figure pas (l'abonnement est gardé, mais ne montre plus
    // rien) : sinon l'export dirait qu'il existe encore, alors qu'un projet supprimé disparaît.
    const followedMembers = await db
      .select({ id: schema.memberFollow.memberId, followedAt: schema.memberFollow.createdAt })
      .from(schema.memberFollow)
      .where(eq(schema.memberFollow.followerId, user.id))
      .orderBy(asc(schema.memberFollow.createdAt))
    const followedProjects = await db
      .select({ id: schema.projectFollow.projectId, followedAt: schema.projectFollow.createdAt })
      .from(schema.projectFollow)
      .innerJoin(schema.project, eq(schema.project.id, schema.projectFollow.projectId))
      // Un projet suivi retiré par la modération n'y figure pas non plus (listedProject).
      .where(and(eq(schema.projectFollow.followerId, user.id), listedProject()))
      .orderBy(asc(schema.projectFollow.createdAt))
    const withDate = (follows: { id: string; followedAt: Date }[]) =>
      follows.map(({ id, followedAt }) => ({ id, followedAt: followedAt.toISOString() }))

    // Ses réactions et ses commentaires (tranche 5), sur les projets des autres comme sur les
    // siens. Contrairement aux abonnements, ceux d'un projet devenu privé restent : ce sont ses
    // gestes et son texte (droit d'accès). Le projet n'y est donné que par son identifiant, qui ne
    // dit rien de lui (ni titre, ni texte d'un autre).
    const reactions = await reactionsOfMember(db, user.id)
    const comments = await commentsOfAuthor(db, user.id)
    // Son ancien pseudo, s'il lui est encore réservé, avec la date où il redevient libre
    // (tranche 6a). Le pseudo actuel est déjà dans `me`.
    const formerHandle = await formerHandleOf(db, user.id, new Date())

    // Les membres qu'il mentionne dans ses commentaires (tranche 6b), par leur identifiant : c'est
    // ce que la base garde de ses mentions. Une requête pour tous ses commentaires
    // (mentions/load.ts). Jamais les mentions de lui par les autres : elles sont dans leur texte.
    const mentionsByComment = await mentionsOfComments(
      db,
      comments.map((comment) => comment.id),
    )
    // Jusqu'où il a vu ses notifications. Les notifications elles-mêmes n'y sont pas : elles sont
    // calculées à partir des gestes des autres, qui ne sont pas ses données.
    const seenAt = await readSeenAt(db, user.id)
    // Jusqu'où il a lu son fil « Abonnements » (R4), par feed/state.ts, seul lecteur de cette date
    // (jur-J3). Jamais la liste de ce qu'il a lu : elle n'est gardée nulle part.
    const feedReadAt = await readFeedReadAt(db, user.id)
    // Ses réglages d'e-mail et les dates des derniers envois (tranche 6c), valeurs par défaut
    // comprises. Jamais de jeton de désinscription : il se recalcule, il n'est pas gardé.
    const emailPreferences = await exportEmailPreferences(db, user.id)
    // Les signalements qu'il a faits (tranche 7a, règle 18 de la relecture du plan), des plus
    // anciens aux plus récents : la cible, le motif, sa précision, la date et l'issue. Ni le texte
    // visé (snapshot : il appartient à un autre, et a pu devenir privé), ni l'explication de la
    // décision. Jamais les signalements qui le visent : la condition porte sur reporter_id seul.
    // L'index content_report_reporter_idx trouve ses signalements ; le tri se fait en mémoire.
    const reportRows = await db
      .select({
        targetKind: schema.contentReport.targetKind,
        targetId: schema.contentReport.targetId,
        reason: schema.contentReport.reason,
        details: schema.contentReport.details,
        createdAt: schema.contentReport.createdAt,
        status: schema.contentReport.status,
        decidedAt: schema.contentReport.decidedAt,
      })
      .from(schema.contentReport)
      .where(eq(schema.contentReport.reporterId, user.id))
      .orderBy(asc(schema.contentReport.createdAt), asc(schema.contentReport.id))
    // .parse vérifie que chaque valeur lue est l'une de celles permises par le contrat.
    const reports = reportRows.map((row) => ({
      // Les signalements d'avant l'effacement des notes (R7a) gardent `note` : d'où le schéma
      // « stocké », qui l'admet encore.
      targetKind: StoredReportTargetKind.parse(row.targetKind),
      targetId: row.targetId,
      reason: ReportReason.parse(row.reason),
      details: row.details,
      createdAt: row.createdAt.toISOString(),
      outcome: ReportOutcome.parse(row.status),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    }))

    // Les membres qu'il a bloqués (tranche 7b), des plus anciens aux plus récents, avec leur pseudo
    // actuel et la date. Jamais ceux qui l'ont bloqué : ce n'est pas son geste, et le lui dire
    // trahirait leur blocage (blocks/list.ts).
    const blocks = await blocksOfMember(db, user.id)
    // Les suggestions qu'il a écartées (R4, jur-J4), même forme que les blocages : l'écarté par son
    // pseudo actuel, jamais par son nom. Jamais celles qui le visent : l'écarté n'en sait rien.
    const dismissedSuggestions = await dismissedSuggestionsOf(db, user.id)
    // Les suspensions de son compte (tranche 7c, J8), avec leur fin réelle et la raison d'une
    // levée ; jamais l'administrateur qui a décidé, jamais qui a signalé (suspension/load.ts).
    const moderation = await suspensionsOfMember(db, user.id, new Date())

    // Content-Disposition: attachment → le navigateur propose d'enregistrer le fichier.
    // Le nom du fichier porte le nom de l'appli que voient les membres, jamais le nom de code.
    c.header('Content-Disposition', `attachment; filename="${appName.toLowerCase()}-export.json"`)
    return c.json(
      {
        exportedAt: new Date().toISOString(),
        user: me,
        formerHandle,
        projects,
        categoryChanges,
        updates,
        testerOf,
        // R7b, provisoire au commit du contrat : remplis avec les routes du coin des testeurs.
        testerCalls: [],
        testerMessages: [],
        testerRemovals: [],
        testerThreadReads: [],
        follows: { members: withDate(followedMembers), projects: withDate(followedProjects) },
        reactions,
        comments: comments.map((comment) => ({
          ...comment,
          mentions: mentionsByComment.get(comment.id) ?? [],
        })),
        reports,
        blocks,
        moderation,
        notifications: { seenAt: seenAt?.toISOString() ?? null },
        feed: { readAt: feedReadAt?.toISOString() ?? null },
        dismissedSuggestions,
        emailPreferences,
        loginMethods: loginMethods.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        sessions: sessions.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        })),
      },
      200,
    )
  })

  return app
}
