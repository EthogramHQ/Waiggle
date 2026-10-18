// Service des fichiers stockés : GET /media/avatars/<nom>.webp et GET /media/visuals/<nom>.webp
// Depuis la tranche 3b-1, rien n'est visible sans compte (docs/scenarios/phase-1.md) :
// - un avatar s'affiche pour tout membre connecté ;
// - un visuel de projet, seulement pour un membre connecté qui voit le projet (public, ou le sien).
// Dans tous les autres cas : 404, sans plus de détail. On ne distingue pas « pas connecté » de
// « introuvable » : une adresse ne révèle rien, même pas qu'elle existe.
import type { Database } from '@ruche/db'
import { Hono } from 'hono'
import { errorBody, languageOf } from '../errors'
import { type FileStorage, isValidKey } from '../media/storage'
import { isVisualVisibleTo } from '../projects/load'
import type { AppEnv } from '../types'

type Deps = { db: Database; storage: FileStorage }

export const mediaRoutes = ({ db, storage }: Deps) => {
  const app = new Hono<AppEnv>()

  // {(?:avatars|visuals)} : le dossier, l'un ou l'autre, en entier (le groupe ancre l'alternative).
  // isValidKey revérifie de toute façon le nom complet juste après.
  app.get('/media/:folder{(?:avatars|visuals)}/:file', async (c) => {
    const notFound = () => c.json(errorBody(languageOf(c), 'not_found'), 404)
    // c.get('user') : le membre connecté, retrouvé par le middleware de session (voir app.ts).
    const user = c.get('user')
    if (!user) return notFound()

    const key = `${c.req.param('folder')}/${c.req.param('file')}`
    // Nom invalide (« ../ », mauvaise extension…) : 404, sans même regarder la base.
    if (!isValidKey(key)) return notFound()
    if (key.startsWith('visuals/') && !(await isVisualVisibleTo(db, key, user.id))) {
      return notFound()
    }
    const data = await storage.get(key)
    if (!data) return notFound()

    // new Uint8Array(…) : copie dans un tableau d'octets du type exact attendu par Hono.
    return c.body(new Uint8Array(data), 200, {
      'Content-Type': 'image/webp',
      // Le fichier ne changera jamais (une nouvelle image = un nouveau nom) : le navigateur peut
      // le garder un an sans redemander. « private » : lui seul, jamais un cache partagé (proxy
      // d'entreprise, cache d'un hébergeur), puisque l'image est réservée à certains membres.
      'Cache-Control': 'private, max-age=31536000, immutable',
      // Si un navigateur ouvrait ce fichier comme une page, il n'y exécuterait rien (défense en
      // profondeur : le fichier est une image ré-encodée par nos soins, et nosniff est déjà actif).
      'Content-Security-Policy': "default-src 'none'; sandbox",
    })
  })

  return app
}
