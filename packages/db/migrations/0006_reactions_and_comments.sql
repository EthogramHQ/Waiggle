-- Tranche 5 (réagir et commenter) : deux tables neuves, leurs clés étrangères et leurs index.
-- Ajouté à la main, ce commentaire seulement : aucune ligne existante n'est touchée.
CREATE TABLE "project_comment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" text,
	"root_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"edited_at" timestamp,
	"hidden_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_reaction" (
	"project_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "project_reaction_project_id_member_id_kind_pk" PRIMARY KEY("project_id","member_id","kind"),
	CONSTRAINT "project_reaction_kind" CHECK ("project_reaction"."kind" in ('amazing', 'inspiring', 'useful', 'funny', 'bravo'))
);
--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_root_id_project_comment_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."project_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reaction" ADD CONSTRAINT "project_reaction_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reaction" ADD CONSTRAINT "project_reaction_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_comment_project_roots_idx" ON "project_comment" USING btree ("project_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "project_comment"."root_id" is null;--> statement-breakpoint
CREATE INDEX "project_comment_root_created_idx" ON "project_comment" USING btree ("root_id","created_at","id");--> statement-breakpoint
CREATE INDEX "project_comment_project_idx" ON "project_comment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_comment_author_idx" ON "project_comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "project_reaction_member_idx" ON "project_reaction" USING btree ("member_id");