CREATE TABLE "project_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_note" ADD CONSTRAINT "project_note_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_note_project_created_idx" ON "project_note" USING btree ("project_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);