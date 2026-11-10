-- R7a : les notes du Journal deviennent des mises à jour, et les membres peuvent tester un projet.
-- Ordre : 1. les tables neuves et la colonne des photos ; 2. les signalements anciens ; 3. les
-- effacements (le Journal et les anciennes colonnes d'outils, gardées « jusqu'en R7 » par R6b).

-- 1. Les mises à jour d'un projet : des lignes classées par famille (jsonb), un titre et une version
--    facultatifs ; la date est écrite par l'API.
CREATE TABLE "project_update" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text,
	"version" text,
	"lines" jsonb NOT NULL,
	"before_after" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"removed_at" timestamp,
	"removal_id" uuid
);
--> statement-breakpoint
-- Les testeurs : member_id est un texte, comme user.id (Better Auth).
CREATE TABLE "project_tester" (
	"member_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "project_tester_member_id_project_id_pk" PRIMARY KEY("member_id","project_id")
);
--> statement-breakpoint
-- La mise à jour qui montre une photo (slot 'update') ; null : photo d'un autre emplacement, ou en
-- attente de publication. Les lignes existantes gardent null, ce qui est juste : aucune n'a le slot 'update'.
ALTER TABLE "project_media" ADD COLUMN "update_id" uuid;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tester" ADD CONSTRAINT "project_tester_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tester" ADD CONSTRAINT "project_tester_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_update_id_project_update_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."project_update"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_update_project_created_idx" ON "project_update" USING btree ("project_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "project_tester_project_idx" ON "project_tester" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_media_update_idx" ON "project_media" USING btree ("update_id");--> statement-breakpoint
CREATE INDEX "project_media_pending_idx" ON "project_media" USING btree ("project_id") WHERE "project_media"."slot" = 'update' and "project_media"."update_id" is null;--> statement-breakpoint
-- 2. Les signalements anciens. Une note n'existera plus : un signalement encore ouvert sur elle
--    devient « sans objet » (void), daté de maintenant pour que la purge l'efface 30 jours plus tard.
--    Les signalements déjà décidés gardent leur décision et leur copie ; ceux des autres cibles ne bougent pas.
UPDATE "content_report" SET "status" = 'void', "decided_at" = now() WHERE "target_kind" = 'note' AND "status" = 'open';--> statement-breakpoint
-- 3. Les effacements. Les outils des projets et des profils sont dans project_tool et profile_tool
--    depuis R6b (migration 0016) : ces liens ne sont pas touchés. DROP TABLE emporte les index et
--    les clés étrangères de project_note ; l'index GIN des étiquettes est effacé avant sa colonne.
DROP TABLE "project_note" CASCADE;--> statement-breakpoint
DROP INDEX "project_tool_slugs_idx";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "tools";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "tool_slugs";--> statement-breakpoint
ALTER TABLE "profile" DROP COLUMN "favorite_tools";
