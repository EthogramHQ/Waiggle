CREATE TABLE "feed_state" (
	"member_id" text PRIMARY KEY NOT NULL,
	"read_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_suggestion_dismissal" (
	"member_id" text NOT NULL,
	"dismissed_id" text NOT NULL,
	"at" timestamp NOT NULL,
	CONSTRAINT "member_suggestion_dismissal_member_id_dismissed_id_pk" PRIMARY KEY("member_id","dismissed_id")
);
--> statement-breakpoint
ALTER TABLE "feed_state" ADD CONSTRAINT "feed_state_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_suggestion_dismissal" ADD CONSTRAINT "member_suggestion_dismissal_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_suggestion_dismissal" ADD CONSTRAINT "member_suggestion_dismissal_dismissed_id_user_id_fk" FOREIGN KEY ("dismissed_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_suggestion_dismissal_dismissed_idx" ON "member_suggestion_dismissal" USING btree ("dismissed_id");