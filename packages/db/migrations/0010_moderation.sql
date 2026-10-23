CREATE TABLE "admin_member" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"alerted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "content_report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" text,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"project_id" uuid,
	"target_author_id" text,
	"reason" text NOT NULL,
	"details" text,
	"snapshot" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"decision_id" uuid
);
--> statement-breakpoint
CREATE TABLE "moderation_decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"ground" text,
	"explanation" text,
	"admin_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_comment" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_comment" ADD COLUMN "removal_id" uuid;--> statement-breakpoint
ALTER TABLE "project_note" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_note" ADD COLUMN "removal_id" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "removal_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_member" ADD CONSTRAINT "admin_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_target_author_id_user_id_fk" FOREIGN KEY ("target_author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_decision_id_moderation_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decision" ADD CONSTRAINT "moderation_decision_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_reporter_target_idx" ON "content_report" USING btree ("reporter_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "content_report_open_idx" ON "content_report" USING btree ("created_at") WHERE "content_report"."status" = 'open';--> statement-breakpoint
CREATE INDEX "content_report_target_idx" ON "content_report" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "content_report_target_author_idx" ON "content_report" USING btree ("target_author_id");--> statement-breakpoint
CREATE INDEX "content_report_reporter_idx" ON "content_report" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "moderation_decision_target_idx" ON "moderation_decision" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_note" ADD CONSTRAINT "project_note_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;