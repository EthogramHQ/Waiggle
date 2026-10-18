// Réglages à faire avant tout le reste de l'appli : ce fichier est le tout premier chargé (voir
// apps/app/index.ts).
//
// Zod, la bibliothèque qui vérifie les données (voir packages/contracts), sait accélérer ses
// vérifications en fabriquant du code pendant que l'appli tourne (avec « new Function »). Or le
// site interdit justement d'exécuter du code fabriqué ainsi : c'est une protection de sa CSP (voir
// infra/Caddyfile). Zod s'en apercevrait et s'en passerait, mais le navigateur signalerait un
// blocage à chaque page. On lui demande donc de ne même pas essayer : pour les petits formulaires
// de l'appli, la différence de vitesse est imperceptible.
// Le réglage doit précéder la création du premier schéma : Zod décide à ce moment-là.
import { z } from 'zod'

z.config({ jitless: true })
