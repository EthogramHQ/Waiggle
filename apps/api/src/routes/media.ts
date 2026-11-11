// Service des fichiers stockés : GET /media/avatars/<nom>.webp, /media/visuals/<nom>.webp et
// /media/testers/<nom>.webp (le coin des testeurs, R7b).
// Depuis la tranche 3b-1, rien n'est visible sans compte (docs/scenarios/phase-1.md) :
// - un avatar s'affiche pour tout membre connecté ;
// - un visuel de projet, seulement pour un membre connecté qui voit le projet (public, ou le sien) ;
// - une image du coin des testeurs, selon qui la voit (voir canSeeTesterMedia).
// Dans tous les autres cas : 404, sans plus de détail. On ne distingue pas « pas connecté » de
// « introuvable » : une adresse ne révèle rien, même pas qu'elle existe.
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { errorBody, languageOf } from '../errors'
import { type FileStorage, isValidKey } from '../media/storage'
import { isVisualVisibleTo } from '../projects/load'
import { isActiveAdmin } from '../reports/admin'
import { cornerAccess } from '../testers/access'
import type { AppEnv } from '../types'

type Deps = { db: Database; storage: FileStorage }

/**
 * Un signalement ouvert vise-t-il ce message ou cet appel ? Une lecture par l'index
 * `content_report_target_idx` (sorte, cible) ; `limit 1` : une ligne nous suffit.
 */
const hasOpenReport = async (db: Database, kind: 'call' | 'message', targetId: string) => {
  const [row] = await db
    .select({ id: schema.contentReport.id })
    .from(schema.contentReport)
    .where(
      and(
        eq(schema.contentReport.targetKind, kind),
        eq(schema.contentReport.targetId, targetId),
        eq(schema.contentReport.status, 'open'),
      ),
    )
    .limit(1)
  return row !== undefined
}

/**
 * Ce membre peut-il ouvrir cette image du coin des testeurs ? Une première lecture trouve l'image
 * avec son appel, son message et le projet (l'image par la clé unique `storage_key`, les autres
 * tables par leur clé primaire) ; ensuite, une lecture de plus au plus répond (le droit d'un
 * testeur, ou un signalement ouvert pour la modération).
 *
 * Les règles, dans l'ordre :
 * - le déposant voit toujours la sienne, en attente et retirée comprises ;
 * - une image en attente (ni appel ni message) : son déposant seul ;
 * - un message ou un appel retiré : son expéditeur seul (le déposant, déjà passé) ;
 * - la capture d'un message : son déposant (le testeur du fil) et l'auteur du projet, qui relit
 *   son historique même coin fermé ;
 * - la photo d'un appel : son déposant (l'auteur) et les testeurs actuels, coin ouvert ;
 * - un administrateur : seulement tant qu'un signalement ouvert vise ce message ou cet appel.
 * Partout ailleurs : faux, donc le même 404 qu'une image inconnue.
 */
const canSeeTesterMedia = async (db: Database, storageKey: string, viewerId: string) => {
  const [row] = await db
    .select({
      ownerId: schema.testerMedia.ownerId,
      projectId: schema.testerMedia.projectId,
      authorId: schema.project.authorId,
      callId: schema.testerMedia.callId,
      callRemovedAt: schema.testerCall.removedAt,
      messageId: schema.testerMedia.messageId,
      messageRemovedAt: schema.testerMessage.removedAt,
    })
    .from(schema.testerMedia)
    .innerJoin(schema.project, eq(schema.project.id, schema.testerMedia.projectId))
    .leftJoin(schema.testerCall, eq(schema.testerCall.id, schema.testerMedia.callId))
    .leftJoin(schema.testerMessage, eq(schema.testerMessage.id, schema.testerMedia.messageId))
    .where(eq(schema.testerMedia.storageKey, storageKey))
  if (!row) return false
  if (row.ownerId === viewerId) return true

  const target = row.messageId
    ? ({ kind: 'message', id: row.messageId, removed: row.messageRemovedAt !== null } as const)
    : row.callId
      ? ({ kind: 'call', id: row.callId, removed: row.callRemovedAt !== null } as const)
      : null
  // En attente : rien n'est partagé, seul le déposant (déjà passé) la voit.
  if (!target) return false

  if (!target.removed) {
    if (target.kind === 'message' && row.authorId === viewerId) return true
    // cornerAccess ne dit « tester » que pour un testeur actuel, coin ouvert : un ancien testeur
    // ou un autre membre n'a pas droit aux photos des appels.
    if (target.kind === 'call' && (await cornerAccess(db, row.projectId, viewerId)) === 'tester') {
      return true
    }
  }
  // La modération : seulement tant qu'un signalement ouvert vise ce message ou cet appel, et pour
  // un administrateur en fonction (le rôle se relit à chaque fois, suspension comprise).
  return (await hasOpenReport(db, target.kind, target.id)) && (await isActiveAdmin(db, viewerId))
}

export const mediaRoutes = ({ db, storage }: Deps) => {
  const app = new Hono<AppEnv>()

  // `:folder` : le dossier de la clé. Un dossier inconnu reçoit le même 404 qu'un fichier inconnu.
  app.get('/media/:folder/:file', async (c) => {
    const notFound = () => c.json(errorBody(languageOf(c), 'not_found'), 404)
    // c.get('user') : le membre connecté, retrouvé par le middleware de session (voir app.ts).
    const user = c.get('user')
    if (!user) return notFound()

    const folder = c.req.param('folder')
    const key = `${folder}/${c.req.param('file')}`
    // Dossier inconnu, ou nom invalide (« ../ », mauvaise extension…) : 404, sans regarder la base.
    if (!['avatars', 'visuals', 'testers'].includes(folder) || !isValidKey(key)) return notFound()
    // Un contrôle par dossier ; un avatar se montre à tout membre connecté.
    if (folder === 'visuals' && !(await isVisualVisibleTo(db, key, user.id))) return notFound()
    if (folder === 'testers' && !(await canSeeTesterMedia(db, key, user.id))) return notFound()
    const data = await storage.get(key)
    if (!data) return notFound()

    // new Uint8Array(…) : copie dans un tableau d'octets du type exact attendu par Hono.
    return c.body(new Uint8Array(data), 200, {
      'Content-Type': 'image/webp',
      // Avatars et visuels : le fichier ne changera jamais (une nouvelle image = un nouveau nom),
      // le navigateur peut le garder un an. « private » : lui seul, jamais un cache partagé (proxy
      // d'entreprise, hébergeur), puisque l'image est réservée à certains membres. Le coin des
      // testeurs : « no-store », car le droit de la voir se retire (message retiré, testeur
      // parti) : rien ne la garde au-delà de l'affichage.
      'Cache-Control':
        folder === 'testers' ? 'private, no-store' : 'private, max-age=31536000, immutable',
      // Si un navigateur ouvrait ce fichier comme une page, il n'y exécuterait rien (défense en
      // profondeur : le fichier est une image ré-encodée par nos soins, et nosniff est déjà actif).
      'Content-Security-Policy': "default-src 'none'; sandbox",
    })
  })

  return app
}
