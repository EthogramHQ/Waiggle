CREATE TABLE "member_block" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_block_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "member_block_not_self" CHECK ("member_block"."blocker_id" <> "member_block"."blocked_id")
);
--> statement-breakpoint
DROP INDEX "content_report_reporter_target_idx";--> statement-breakpoint
-- Modifié à la main : une copie d'avant 7b est un texte seul ; elle devient un tableau d'un seul
-- champ, « text » (ReportSnapshot l'accepte pour toutes les sortes de cible). Sans « using »,
-- PostgreSQL ne sait pas changer un texte en jsonb.
ALTER TABLE "content_report" ALTER COLUMN "snapshot" SET DATA TYPE jsonb USING jsonb_build_array(jsonb_build_object('field', 'text', 'value', "snapshot"));--> statement-breakpoint
ALTER TABLE "member_block" ADD CONSTRAINT "member_block_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_block" ADD CONSTRAINT "member_block_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_block_blocked_idx" ON "member_block" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_reporter_target_idx" ON "content_report" USING btree ("reporter_id","target_kind","target_id") WHERE "content_report"."status" = 'open';