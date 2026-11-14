// Le rang d'une photo visée par une partie (R9) : « La 2e photo de Météo ». Une seule règle, en
// SQL, pour la file de la modération, la liste des retirés, l'historique et les notifications.
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'

/**
 * Le rang, à partir de 1, de la photo `mediaId` parmi les photos du même endroit, dans l'ordre que
 * l'auteur leur a donné (`position`) : la galerie d'un projet, ou les photos d'une mise à jour. La
 * photo d'un appel ou la capture d'un message du coin des testeurs est seule : rang 1. La
 * couverture verticale (slot 'portrait') n'a pas de rang (null), ni une photo qui n'est plus là.
 *
 * Le rang compte toutes les photos, retirées comprises : c'est celui que voit leur auteur, chez qui
 * une photo retirée reste à sa place (la modération et l'auteur parlent ainsi de la même photo).
 *
 * Une sous-requête scalaire (entre parenthèses, une seule valeur) : la photo par la clé primaire de
 * project_media, puis `count(*)` des photos d'avant elle, par l'index project_media_project_idx
 * (project_id, slot, position) pour la galerie, project_media_update_idx pour une mise à jour.
 * « union all … limit 1 » essaie ensuite tester_media, par sa clé primaire. `mediaId` est une
 * colonne écrite par l'appelant avec le nom de sa table (sql.raw), ou un paramètre lié.
 */
export const photoRankSql = (mediaId: SQLWrapper): SQL<number | null> => sql<number | null>`(
  select rank from (
    select case t.slot
      when 'gallery' then (select count(*)::int from project_media o
        where o.project_id = t.project_id and o.slot = 'gallery' and o.position <= t.position)
      when 'update' then (select count(*)::int from project_media o
        where o.update_id = t.update_id and o.slot = 'update' and o.position <= t.position)
      end as rank
    from project_media t where t.id = ${mediaId}
    union all
    select 1 from tester_media tm where tm.id = ${mediaId}
  ) ranked
  limit 1
)`
