CREATE TABLE "project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"pitch" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"demo_url" text,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"tool_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"time_spent" text,
	"prompts" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_author_created_idx" ON "project" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "project_tool_slugs_idx" ON "project" USING gin ("tool_slugs");