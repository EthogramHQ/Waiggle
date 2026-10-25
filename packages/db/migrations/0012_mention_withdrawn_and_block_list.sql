-- Commentaires ajoutés à la main (tranche 7b, corrections après relectures).
-- 1. Une mention retirée par l'auteur à la modification n'est plus effacée : elle garde sa ligne,
--    datée par withdrawn_at, pour que le membre mentionné lise encore le commentaire (règle 2).
--    Les lignes existantes sont toutes des mentions encore écrites dans leur texte (celles qui
--    avaient été retirées ont été effacées avant cette version) : null leur convient, rien à remplir.
ALTER TABLE "comment_mention" ADD COLUMN "withdrawn_at" timestamp;--> statement-breakpoint
-- 2. L'index de la liste « Membres bloqués », dans l'ordre de la page (date puis identifiant,
--    décroissants) : il se construit à partir des lignes déjà là, sans les changer.
CREATE INDEX "member_block_blocker_created_idx" ON "member_block" USING btree ("blocker_id","created_at" DESC NULLS FIRST,"blocked_id" DESC NULLS FIRST);
