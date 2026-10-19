CREATE TABLE "member_follow" (
	"follower_id" text NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_follow_follower_id_member_id_pk" PRIMARY KEY("follower_id","member_id"),
	CONSTRAINT "member_follow_not_self" CHECK ("member_follow"."follower_id" <> "member_follow"."member_id")
);
--> statement-breakpoint
CREATE TABLE "project_follow" (
	"follower_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_follow_follower_id_project_id_pk" PRIMARY KEY("follower_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
-- Ajouté à la main : les projets publics qui existent déjà n'ont pas de date de publication. On
-- prend leur date de création, la meilleure qu'on ait (on ne sait pas s'ils ont été privés avant).
-- Les projets privés gardent null : ils recevront leur date le jour où ils deviendront publics.
UPDATE "project" SET "published_at" = "created_at" WHERE "visibility" = 'public';--> statement-breakpoint
ALTER TABLE "member_follow" ADD CONSTRAINT "member_follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_follow" ADD CONSTRAINT "member_follow_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_follow" ADD CONSTRAINT "project_follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_follow" ADD CONSTRAINT "project_follow_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_follow_member_idx" ON "member_follow" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "project_follow_project_idx" ON "project_follow" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_public_published_idx" ON "project" USING btree ("published_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "project"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "project_author_published_idx" ON "project" USING btree ("author_id","published_at");