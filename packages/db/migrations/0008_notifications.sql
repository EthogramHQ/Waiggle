CREATE TABLE "comment_mention" (
	"comment_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"handle" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "comment_mention_comment_id_member_id_pk" PRIMARY KEY("comment_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "notification_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_comment_id_project_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."project_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mention" ADD CONSTRAINT "comment_mention_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_mention_member_idx" ON "comment_mention" USING btree ("member_id");