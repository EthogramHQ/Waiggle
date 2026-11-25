-- R19 (plan, choix 17) : le rattrapage du jeu. Au déploiement, chaque membre reçoit une fois le
-- pollen et les sceaux de ce qu'il a déjà fait : réactions, commentaires, inscriptions de testeur,
-- retours et retours réglés, mises à jour, projets publiés, suivis, ruches créées, invitations
-- acceptées, profil (photo, bio, premier outil). Une migration de données seulement : aucune table
-- ne change, et aucune ligne existante n'est modifiée ; elle n'écrit que dans les tables du jeu,
-- vides jusque-là (0029).
--
-- Les règles :
-- - chaque entrée garde la date d'origine du geste ; son jour et sa semaine sont ceux de Paris
--   (`created_at`, une heure UTC sans fuseau, lue comme UTC puis ramenée à l'heure de Paris) ;
-- - sans plafond par jour : le passé est payé en entier ;
-- - les clés (`source_key`) sont celles des routes de geste : un geste déjà rattrapé ne paiera
--   jamais une seconde fois quand le membre le refera (réagir de nouveau, suivre de nouveau) ;
-- - un compte d'exemple ne gagne rien et ne fait gagner personne (ni quand il agit, ni quand il
--   reçoit) ; un compte suspendu, lui, est rattrapé (le pollen de son passé est le sien) ;
-- - un contenu déjà retiré par la modération entre révoqué (`revoked_at`, à la date du retrait), et
--   ce que l'auteur d'un projet a reçu à cause de lui aussi (relectures J4, S5) ; un projet retiré
--   révoque sa publication et ce que son auteur y a reçu, jamais le pollen des autres (choix 9) ;
-- - toutes les entrées portent `backfill = true` : elles ne comptent pas dans les semaines butinées,
--   les séries partent de zéro (scénario, « Au lancement ») ; ni miel, ni défis ;
-- - l'autre membre d'un geste (`counterpart_id`) n'est gardé que pour les deux dernières semaines,
--   comme le fait la purge de nuit (relecture J3) : le passé plus ancien entre sans lui ;
-- - les sceaux de ce passé, sans leur avis ; un seul avis par compte, l'introduction (J1).
--
-- Rejouable sans doublon : chaque insertion passe par « on conflict do nothing » sur la clé unique
-- de sa table (une ligne déjà là est laissée telle quelle), et l'avis d'introduction n'est écrit
-- que s'il manque.

-- 1. Le grand livre. La sous-requête `g` rassemble tous les gestes du passé, un « union all » par
-- sorte (chaque branche lit sa table par sa clé primaire ou un index qui commence par la colonne
-- jointe) ; `rule` donne la famille et le montant de chaque geste (recopiés de `POLLEN_GESTURES`,
-- packages/contracts/src/game.ts : le test du rattrapage vérifie les totaux) ; `local` calcule
-- l'heure de Paris une fois par ligne (« lateral » : une sous-requête qui lit la ligne courante).
INSERT INTO "pollen_entry" ("id", "member_id", "gesture", "family", "amount", "source_kind",
  "source_id", "source_key", "counterpart_id", "project_id", "day", "week", "created_at",
  "revoked_at", "backfill")
SELECT gen_random_uuid(), g.member_id, g.gesture, rule.family, rule.amount, g.source_kind,
  g.source_id, g.source_key,
  -- La semaine de la migration, à Paris : `now() at time zone 'UTC'` donne l'heure UTC sans fuseau,
  -- relue ensuite comme les colonnes. Les entrées d'avant la semaine précédente perdent l'autre membre.
  CASE WHEN date_trunc('week', local.at)::date >= date_trunc('week',
      (now() at time zone 'UTC') at time zone 'UTC' at time zone 'Europe/Paris')::date - 7
    THEN g.counterpart_id END,
  g.project_id, local.at::date, date_trunc('week', local.at)::date, g.created_at, g.revoked_at,
  true
FROM (
  -- Réagir (2 pollen, une fois par projet et par sorte de réaction) ; l'auteur reçoit 1. Un projet
  -- retiré révoque ce que son auteur a reçu, pas la réaction.
  SELECT r.member_id, 'reaction' AS gesture, 'reaction' AS source_kind, pr.id::text AS source_id,
    pr.id || ':' || r.kind AS source_key, pr.author_id AS counterpart_id, pr.id AS project_id,
    r.created_at, NULL::timestamp AS revoked_at
  FROM project_reaction r JOIN project pr ON pr.id = r.project_id
  WHERE r.member_id <> pr.author_id
  UNION ALL
  SELECT pr.author_id, 'receive_reaction', 'reaction', pr.id::text,
    pr.id || ':' || r.kind || ':' || r.member_id, r.member_id, pr.id, r.created_at, pr.removed_at
  FROM project_reaction r JOIN project pr ON pr.id = r.project_id
  WHERE r.member_id <> pr.author_id
  -- Commenter ou répondre sur le projet d'un autre (10) ; l'auteur reçoit 3. Son propre projet :
  -- rien. Un commentaire dont l'auteur a supprimé son compte (`author_id` nul) : personne à payer.
  UNION ALL
  SELECT c.author_id, 'comment', 'comment', c.id::text, c.id::text, pr.author_id, pr.id,
    c.created_at, c.removed_at
  FROM project_comment c JOIN project pr ON pr.id = c.project_id
  WHERE c.author_id IS NOT NULL AND c.author_id <> pr.author_id
  UNION ALL
  SELECT pr.author_id, 'receive_comment', 'comment', c.id::text, c.id::text, c.author_id, pr.id,
    c.created_at, coalesce(c.removed_at, pr.removed_at)
  FROM project_comment c JOIN project pr ON pr.id = c.project_id
  WHERE c.author_id IS NOT NULL AND c.author_id <> pr.author_id
  -- Devenir testeur (10) ; l'auteur reçoit 5.
  UNION ALL
  SELECT t.member_id, 'tester', 'tester', pr.id::text, pr.id::text, pr.author_id, pr.id,
    t.created_at, NULL::timestamp
  FROM project_tester t JOIN project pr ON pr.id = t.project_id
  WHERE t.member_id <> pr.author_id
  UNION ALL
  SELECT pr.author_id, 'receive_tester', 'tester', pr.id::text, pr.id || ':' || t.member_id,
    t.member_id, pr.id, t.created_at, pr.removed_at
  FROM project_tester t JOIN project pr ON pr.id = t.project_id
  WHERE t.member_id <> pr.author_id
  -- Un retour du testeur (25, un par fil et par jour de Paris : le premier du jour) ; l'auteur
  -- reçoit 5. « distinct on » garde une ligne par fil et par jour, la plus ancienne (order by).
  UNION ALL
  SELECT f.tester_id, 'feedback', 'tester_message', f.id::text, f.source_key, f.author_id,
    f.project_id, f.created_at, f.removed_at
  FROM (
    SELECT DISTINCT ON (m.project_id, m.tester_id, paris.day)
      m.id, m.project_id, m.tester_id, pr.author_id, m.created_at, m.removed_at,
      pr.removed_at AS project_removed_at,
      m.project_id || ':' || m.tester_id || ':' || paris.day AS source_key
    FROM tester_message m
    JOIN project pr ON pr.id = m.project_id
    CROSS JOIN LATERAL (
      SELECT (m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date::text AS day
    ) paris
    WHERE m.kind = 'feedback' AND m.sender_id = m.tester_id AND m.tester_id <> pr.author_id
    ORDER BY m.project_id, m.tester_id, paris.day, m.created_at, m.id
  ) f
  UNION ALL
  SELECT f.author_id, 'receive_feedback', 'tester_message', f.id::text, f.source_key, f.tester_id,
    f.project_id, f.created_at, coalesce(f.removed_at, f.project_removed_at)
  FROM (
    SELECT DISTINCT ON (m.project_id, m.tester_id, paris.day)
      m.id, m.project_id, m.tester_id, pr.author_id, m.created_at, m.removed_at,
      pr.removed_at AS project_removed_at,
      m.project_id || ':' || m.tester_id || ':' || paris.day AS source_key
    FROM tester_message m
    JOIN project pr ON pr.id = m.project_id
    CROSS JOIN LATERAL (
      SELECT (m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')::date::text AS day
    ) paris
    WHERE m.kind = 'feedback' AND m.sender_id = m.tester_id AND m.tester_id <> pr.author_id
    ORDER BY m.project_id, m.tester_id, paris.day, m.created_at, m.id
  ) f
  -- Un retour réglé (25 au testeur, à la date du règlement) ; l'auteur qui règle ne gagne rien.
  UNION ALL
  SELECT m.tester_id, 'feedback_settled', 'tester_message', m.id::text, m.id::text, pr.author_id,
    pr.id, m.settled_at, m.removed_at
  FROM tester_message m JOIN project pr ON pr.id = m.project_id
  WHERE m.kind = 'feedback' AND m.sender_id = m.tester_id AND m.settled_at IS NOT NULL
    AND m.tester_id <> pr.author_id
  -- Une mise à jour (20, à l'auteur du projet).
  UNION ALL
  SELECT pr.author_id, 'update', 'update', u.id::text, u.id::text, NULL, pr.id, u.created_at,
    u.removed_at
  FROM project_update u JOIN project pr ON pr.id = u.project_id
  -- Un projet publié (50) : `published_at` posé (un brouillon ne l'a pas), hors « Privé ».
  UNION ALL
  SELECT pr.author_id, 'publish', 'project', pr.id::text, pr.id::text, NULL, pr.id,
    pr.published_at, pr.removed_at
  FROM project pr
  WHERE pr.published_at IS NOT NULL AND pr.visibility <> 'private'
  -- Suivre un membre ou un projet d'un autre (3, une fois par chose suivie).
  UNION ALL
  SELECT f.follower_id, 'follow', 'member', f.member_id, 'member:' || f.member_id, f.member_id,
    NULL, f.created_at, NULL::timestamp
  FROM member_follow f
  WHERE f.follower_id <> f.member_id
  UNION ALL
  SELECT f.follower_id, 'follow', 'project', pr.id::text, 'project:' || pr.id, pr.author_id, pr.id,
    f.created_at, NULL::timestamp
  FROM project_follow f JOIN project pr ON pr.id = f.project_id
  WHERE f.follower_id <> pr.author_id
  -- Créer une ruche (15, à qui l'a créée, s'il a encore son compte).
  UNION ALL
  SELECT h.created_by, 'hive_created', 'hive', h.id::text, 'hive:' || h.id, NULL, NULL,
    h.created_at, NULL::timestamp
  FROM hive h
  WHERE h.created_by IS NOT NULL
  -- Une invitation acceptée : 15 à l'invité, 20 à qui l'a invité. Les invitations elles-mêmes ne
  -- se gardent que 30 jours (purge de nuit) : la source est l'entrée dans la ruche, `hive_member`,
  -- son identifiant celui de la ruche ; les clés sont celles de la route d'acceptation.
  UNION ALL
  SELECT hm.user_id, 'invitation_joined', 'invitation', hm.hive_id::text, 'hive:' || hm.hive_id,
    hm.invited_by, NULL, hm.joined_at, NULL::timestamp
  FROM hive_member hm
  WHERE hm.invited_by IS NOT NULL AND hm.invited_by <> hm.user_id
  UNION ALL
  SELECT hm.invited_by, 'invitation_accepted', 'invitation', hm.hive_id::text,
    'hive:' || hm.hive_id || ':' || hm.user_id, hm.user_id, NULL, hm.joined_at, NULL::timestamp
  FROM hive_member hm
  WHERE hm.invited_by IS NOT NULL AND hm.invited_by <> hm.user_id
  -- Le profil : la photo, la bio, le premier outil favori (10 chacun, une fois). Aucune colonne ne
  -- garde la date de chacun : celle de la dernière modification du profil, sinon de l'inscription.
  UNION ALL
  -- Une photo retirée par la modération garde sa ligne mais change de clé (`withheld/<id de la ligne
  -- de retrait>`, moderation/parts.ts) : l'entrée est révoquée, à la date du retrait (la date de la
  -- dernière modification du profil si la ligne de retrait a été purgée depuis).
  SELECT pf.user_id, 'profile_photo', 'profile', pf.user_id, 'photo', NULL, NULL,
    coalesce(pf.updated_at, u.created_at),
    CASE WHEN pf.avatar_key LIKE 'withheld/%'
      THEN coalesce(cpr.created_at, pf.updated_at, u.created_at) END
  FROM profile pf JOIN "user" u ON u.id = pf.user_id
  LEFT JOIN content_part_removal cpr ON pf.avatar_key = 'withheld/' || cpr.id::text
  WHERE pf.avatar_key IS NOT NULL
  UNION ALL
  SELECT pf.user_id, 'profile_bio', 'profile', pf.user_id, 'bio', NULL, NULL,
    coalesce(pf.updated_at, u.created_at), NULL::timestamp
  FROM profile pf JOIN "user" u ON u.id = pf.user_id
  WHERE btrim(pf.bio) <> ''
  UNION ALL
  SELECT u.id, 'profile_tool', 'profile', u.id, 'tool', NULL, NULL,
    coalesce(pf.updated_at, u.created_at), NULL::timestamp
  FROM "user" u LEFT JOIN profile pf ON pf.user_id = u.id
  WHERE EXISTS (SELECT 1 FROM profile_tool pt WHERE pt.user_id = u.id)
) g
JOIN (VALUES
  ('feedback', 'keeper', 25),
  ('feedback_settled', 'keeper', 25),
  ('tester', 'keeper', 10),
  ('comment', 'forager', 10),
  ('publish', 'builder', 50),
  ('update', 'builder', 20),
  ('reaction', 'forager', 2),
  ('follow', 'forager', 3),
  ('receive_feedback', 'builder', 5),
  ('receive_tester', 'builder', 5),
  ('receive_comment', 'builder', 3),
  ('receive_reaction', 'builder', 1),
  ('hive_created', 'dancer', 15),
  ('invitation_accepted', 'dancer', 20),
  ('invitation_joined', 'dancer', 15),
  ('profile_photo', 'builder', 10),
  ('profile_bio', 'builder', 10),
  ('profile_tool', 'builder', 10)
) AS rule (gesture, family, amount) ON rule.gesture = g.gesture
CROSS JOIN LATERAL (
  SELECT g.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris' AS at
) local
-- Les comptes d'exemple, ni d'un côté ni de l'autre (clé primaire d'example_account).
WHERE NOT EXISTS (SELECT 1 FROM example_account e WHERE e.user_id = g.member_id)
  AND (g.counterpart_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM example_account e WHERE e.user_id = g.counterpart_id))
ON CONFLICT ("member_id", "gesture", "source_key") DO NOTHING;
--> statement-breakpoint
-- 2. Les sceaux des paliers (recopiés de `MILESTONE_SEALS` du contrat) : le n-ième geste non
-- révoqué d'une sorte fait gagner le sceau, daté de ce geste. `row_number() over (partition by …)`
-- numérote les entrées de chaque membre et de chaque sceau dans l'ordre des dates. Les sceaux des
-- semaines butinées ne viennent pas du passé (ses entrées n'en comptent aucune).
INSERT INTO "seal" ("member_id", "code", "earned_at")
SELECT ranked.member_id, ranked.code, ranked.created_at
FROM (
  SELECT pe.member_id, milestone.code, milestone.target, pe.created_at,
    row_number() OVER (PARTITION BY pe.member_id, milestone.code ORDER BY pe.created_at, pe.id) AS n
  FROM pollen_entry pe
  JOIN (VALUES
    ('first_project', 'publish', 1),
    ('first_update', 'update', 1),
    ('first_feedback', 'feedback', 1),
    ('first_settled', 'feedback_settled', 1),
    ('tested_10', 'tester', 10),
    ('feedback_10', 'feedback', 10),
    ('first_hive', 'hive_created', 1),
    ('invitations_5', 'invitation_accepted', 5)
  ) AS milestone (code, gesture, target) ON milestone.gesture = pe.gesture
  WHERE pe.revoked_at IS NULL
) ranked
WHERE ranked.n = ranked.target
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 3. Les sceaux de catégorie : 3 projets différents de la même catégorie principale (« Autre »
-- exclue), testés ou commentés, entrées non révoquées. Le sceau porte le code de la catégorie, daté
-- du premier geste sur le troisième projet.
INSERT INTO "seal" ("member_id", "code", "earned_at")
SELECT ranked.member_id, ranked.category, ranked.first_at
FROM (
  SELECT per_project.*,
    row_number() OVER (PARTITION BY per_project.member_id, per_project.category
      ORDER BY per_project.first_at, per_project.project_id) AS n
  FROM (
    SELECT pe.member_id, pr.primary_category AS category, pe.project_id,
      min(pe.created_at) AS first_at
    FROM pollen_entry pe JOIN project pr ON pr.id = pe.project_id
    WHERE pe.gesture IN ('tester', 'comment') AND pe.revoked_at IS NULL
      AND pr.primary_category IS NOT NULL AND pr.primary_category <> 'other'
    GROUP BY pe.member_id, pr.primary_category, pe.project_id
  ) per_project
) ranked
WHERE ranked.n = 3
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 4. « Une ruche de 5 » : au créateur d'une ruche qui compte 5 membres au moins, s'il en est encore
-- membre et n'est pas un compte d'exemple ; daté de l'entrée du cinquième membre (« offset 4 »
-- saute les quatre premiers). « distinct on » : une ligne par créateur, sa première ruche de 5.
INSERT INTO "seal" ("member_id", "code", "earned_at")
SELECT DISTINCT ON (h.created_by) h.created_by, 'hive_5', fifth.joined_at
FROM hive h
CROSS JOIN LATERAL (
  SELECT hm.joined_at FROM hive_member hm WHERE hm.hive_id = h.id
  ORDER BY hm.joined_at, hm.user_id OFFSET 4 LIMIT 1
) fifth
WHERE h.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM hive_member c WHERE c.hive_id = h.id AND c.user_id = h.created_by)
  AND NOT EXISTS (SELECT 1 FROM example_account e WHERE e.user_id = h.created_by)
ORDER BY h.created_by, fifth.joined_at
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 5. L'avis d'introduction (« Nouveau : ta récolte… », relecture J1) : un par compte, comptes
-- d'exemple exceptés, écrit seulement s'il manque (rejouer la migration n'en ajoute pas).
INSERT INTO "game_notice" ("id", "member_id", "kind", "created_at")
SELECT gen_random_uuid(), u.id, 'intro', now() at time zone 'UTC'
FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM example_account e WHERE e.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM game_notice n WHERE n.member_id = u.id AND n.kind = 'intro');
