CREATE TABLE "email_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"weekly_recap" boolean DEFAULT true NOT NULL,
	"mention_emails" boolean DEFAULT false NOT NULL,
	"recap_sent_at" timestamp,
	"recap_unvisited" integer DEFAULT 0 NOT NULL,
	"mention_sent_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "email_preference" ADD CONSTRAINT "email_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_preference_mentions_idx" ON "email_preference" USING btree ("user_id") WHERE "email_preference"."mention_emails";