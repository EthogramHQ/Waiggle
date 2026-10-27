-- Commentaires et remplissage ajoutés à la main (tranche 7c, « Administrer »). Le reste est écrit
-- par drizzle-kit d'après packages/db/src/schema/moderation.ts.
-- 1. La table account_suspension est neuve : aucune ligne existante.
-- 2. Les colonnes nouvelles de moderation_decision, sur les décisions d'avant 7c (retirer, classer,
--    rétablir) : duration et lift_cause restent null (ce ne sont ni des suspensions ni des levées),
--    after_report prend sa valeur par défaut (faux). target_member_id, le membre visé, est rempli à
--    la fin de ce fichier, sorte de cible par sorte de cible.
CREATE TABLE "account_suspension" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"decision_id" uuid,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"lifted_at" timestamp,
	"lift_decision_id" uuid,
	"after_report" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "target_member_id" text;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "duration" text;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "after_report" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "lift_cause" text;--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_decision_id_moderation_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_lift_decision_id_moderation_decision_id_fk" FOREIGN KEY ("lift_decision_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_suspension_open_idx" ON "account_suspension" USING btree ("user_id") WHERE "account_suspension"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "account_suspension_user_idx" ON "account_suspension" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "account_suspension_decision_idx" ON "account_suspension" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "account_suspension_lift_decision_idx" ON "account_suspension" USING btree ("lift_decision_id");--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD CONSTRAINT "moderation_decision_target_member_id_user_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_decision_created_idx" ON "moderation_decision" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "moderation_decision_member_idx" ON "moderation_decision" USING btree ("target_member_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "moderation_decision_admin_idx" ON "moderation_decision" USING btree ("admin_id","created_at");--> statement-breakpoint
-- Remplissage de target_member_id (plan 7c, « Données » ; relecture de sécurité S13). Une requête
-- par sorte de cible. « update … from » joint chaque décision à la table de sa cible ; une décision
-- dont la cible a disparu ne trouve aucune ligne et garde null. On compare des textes
-- (p.id::text = d.target_id) plutôt que de convertir target_id en uuid : la conversion d'un
-- identifiant mal formé ferait échouer toute la migration, donc la mise en production.
-- Un projet : son auteur.
UPDATE "moderation_decision" d SET "target_member_id" = p."author_id"
	FROM "project" p
	WHERE d."target_kind" = 'project' AND p."id"::text = d."target_id";--> statement-breakpoint
-- Une note : l'auteur de son projet (une note n'a pas d'auteur à elle).
UPDATE "moderation_decision" d SET "target_member_id" = p."author_id"
	FROM "project_note" n JOIN "project" p ON p."id" = n."project_id"
	WHERE d."target_kind" = 'note' AND n."id"::text = d."target_id";--> statement-breakpoint
-- Un commentaire : son auteur.
UPDATE "moderation_decision" d SET "target_member_id" = c."author_id"
	FROM "project_comment" c
	WHERE d."target_kind" = 'comment' AND c."id"::text = d."target_id";--> statement-breakpoint
-- Un profil : le membre lui-même, par une jointure sur "user" (S13). Jamais une copie de
-- target_id : le profil d'un compte supprimé depuis donnerait l'id d'un compte qui n'existe plus
-- (refusé par la clé étrangère), et ce membre parti doit garder null.
UPDATE "moderation_decision" d SET "target_member_id" = u."id"
	FROM "user" u
	WHERE d."target_kind" = 'member' AND u."id" = d."target_id";
