-- R9 « la modération, avec 7d » : signaler et retirer une seule partie d'un contenu (une photo, la
-- description, la bio…). La table des parties retirées en cours, la partie sur les signalements et
-- les décisions (avec l'ancien nom ou pseudo remplacé d'office), le retrait d'une seule photo, et le
-- pseudo retiré tenu réservé 30 jours. Écrite par drizzle-kit, sans reprise de données : toutes les
-- colonnes neuves sont nulles pour ce qui existe (un signalement ou un retrait d'avant visait le
-- contenu entier).
CREATE TABLE "content_part_removal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"removal_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"object_kind" text NOT NULL,
	"project_id" uuid,
	"update_id" uuid,
	"call_id" uuid,
	"message_id" uuid,
	"field" text NOT NULL,
	"project_media_id" uuid,
	"tester_media_id" uuid,
	"hidden_value" jsonb,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "content_part_removal_object_check" CHECK (("content_part_removal"."object_kind" = 'project' and "content_part_removal"."project_id" is not null and "content_part_removal"."update_id" is null and "content_part_removal"."call_id" is null and "content_part_removal"."message_id" is null)
        or ("content_part_removal"."object_kind" = 'update' and "content_part_removal"."update_id" is not null and "content_part_removal"."project_id" is null and "content_part_removal"."call_id" is null and "content_part_removal"."message_id" is null)
        or ("content_part_removal"."object_kind" = 'call' and "content_part_removal"."call_id" is not null and "content_part_removal"."project_id" is null and "content_part_removal"."update_id" is null and "content_part_removal"."message_id" is null)
        or ("content_part_removal"."object_kind" = 'message' and "content_part_removal"."message_id" is not null and "content_part_removal"."project_id" is null and "content_part_removal"."update_id" is null and "content_part_removal"."call_id" is null)
        or ("content_part_removal"."object_kind" = 'member' and "content_part_removal"."project_id" is null and "content_part_removal"."update_id" is null and "content_part_removal"."call_id" is null and "content_part_removal"."message_id" is null)),
	CONSTRAINT "content_part_removal_field_check" CHECK ("content_part_removal"."field" in ('description', 'tools', 'demoUrl', 'cover', 'photo', 'photoDescription', 'prompt', 'name', 'handle', 'bio', 'favoriteTools', 'avatar')),
	CONSTRAINT "content_part_removal_media_check" CHECK (("content_part_removal"."field" in ('cover', 'photo', 'photoDescription')) = (num_nonnulls("content_part_removal"."project_media_id", "content_part_removal"."tester_media_id") = 1)
        and num_nonnulls("content_part_removal"."project_media_id", "content_part_removal"."tester_media_id") <= 1)
);
--> statement-breakpoint
DROP INDEX "content_report_reporter_target_idx";--> statement-breakpoint
ALTER TABLE "member_handle" ADD COLUMN "held_by_removal" uuid;--> statement-breakpoint
ALTER TABLE "content_report" ADD COLUMN "part_field" text;--> statement-breakpoint
ALTER TABLE "content_report" ADD COLUMN "part_media_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "part_field" text;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "part_media_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "previous_value" text;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD COLUMN "provisional_value" text;--> statement-breakpoint
ALTER TABLE "project_media" ADD COLUMN "removal_id" uuid;--> statement-breakpoint
ALTER TABLE "tester_media" ADD COLUMN "removal_id" uuid;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_update_id_project_update_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."project_update"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_call_id_tester_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."tester_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_message_id_tester_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."tester_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_project_media_id_project_media_id_fk" FOREIGN KEY ("project_media_id") REFERENCES "public"."project_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_part_removal" ADD CONSTRAINT "content_part_removal_tester_media_id_tester_media_id_fk" FOREIGN KEY ("tester_media_id") REFERENCES "public"."tester_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_part_removal_project_media_idx" ON "content_part_removal" USING btree ("project_media_id") WHERE "content_part_removal"."field" in ('cover', 'photo');--> statement-breakpoint
CREATE UNIQUE INDEX "content_part_removal_tester_media_idx" ON "content_part_removal" USING btree ("tester_media_id") WHERE "content_part_removal"."field" = 'photo';--> statement-breakpoint
CREATE UNIQUE INDEX "content_part_removal_part_idx" ON "content_part_removal" USING btree ("object_kind",coalesce("project_id"::text, "update_id"::text, "call_id"::text, "message_id"::text, "author_id"),"field",coalesce("project_media_id", "tester_media_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "content_part_removal"."field" not in ('cover', 'photo');--> statement-breakpoint
CREATE INDEX "content_part_removal_author_idx" ON "content_part_removal" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "content_part_removal_removal_idx" ON "content_part_removal" USING btree ("removal_id");--> statement-breakpoint
ALTER TABLE "member_handle" ADD CONSTRAINT "member_handle_held_by_removal_moderation_decision_id_fk" FOREIGN KEY ("held_by_removal") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_media" ADD CONSTRAINT "tester_media_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_reporter_target_idx" ON "content_report" USING btree ("reporter_id","target_kind","target_id",coalesce("part_field", ''),coalesce("part_media_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "content_report"."status" = 'open';--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_part_check" CHECK (("content_report"."part_field" is null and "content_report"."part_media_id" is null)
        or ("content_report"."part_field" is not null and ("content_report"."part_field" in ('cover', 'photo', 'photoDescription')) = ("content_report"."part_media_id" is not null)));--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD CONSTRAINT "moderation_decision_part_check" CHECK ("moderation_decision"."part_media_id" is null or "moderation_decision"."part_field" in ('cover', 'photo', 'photoDescription'));