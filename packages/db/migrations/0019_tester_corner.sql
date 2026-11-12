-- R7b : le coin des testeurs. Cinq tables neuves, aucune ligne existante touchée (rien à remplir) ;
-- les dates sont écrites par l'API (pas de DEFAULT now()). content_report.target_kind est un texte
-- libre sans contrainte : `call` et `message` n'y demandent aucun changement.
-- Les membres retirés par l'auteur (ils ne peuvent plus s'inscrire).
CREATE TABLE "project_tester_removal" (
	"project_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "project_tester_removal_project_id_member_id_pk" PRIMARY KEY("project_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "tester_call" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"removed_at" timestamp,
	"removal_id" uuid
);
--> statement-breakpoint
CREATE TABLE "tester_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"call_id" uuid,
	"message_id" uuid,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"thumbhash" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "tester_media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "tester_media_kind_check" CHECK ("tester_media"."kind" in ('call', 'capture')),
	CONSTRAINT "tester_media_one_target_check" CHECK ("tester_media"."call_id" is null or "tester_media"."message_id" is null)
);
--> statement-breakpoint
CREATE TABLE "tester_message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"tester_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text,
	"device" text,
	"text" text,
	"created_at" timestamp NOT NULL,
	"settled_at" timestamp,
	"settled_update_id" uuid,
	"removed_at" timestamp,
	"removal_id" uuid,
	CONSTRAINT "tester_message_kind_check" CHECK ("tester_message"."kind" in ('feedback', 'reply')),
	CONSTRAINT "tester_message_outcome_check" CHECK (("tester_message"."kind" = 'feedback' and "tester_message"."outcome" in ('yes', 'partly', 'no')) or ("tester_message"."kind" = 'reply' and "tester_message"."outcome" is null)),
	CONSTRAINT "tester_message_device_check" CHECK ("tester_message"."device" is null or "tester_message"."device" in ('phone', 'computer', 'tablet'))
);
--> statement-breakpoint
CREATE TABLE "tester_thread" (
	"project_id" uuid NOT NULL,
	"tester_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"author_read_at" timestamp,
	"tester_read_at" timestamp,
	CONSTRAINT "tester_thread_project_id_tester_id_pk" PRIMARY KEY("project_id","tester_id")
);
--> statement-breakpoint
ALTER TABLE "project_tester_removal" ADD CONSTRAINT "project_tester_removal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tester_removal" ADD CONSTRAINT "project_tester_removal_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_call" ADD CONSTRAINT "tester_call_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_call" ADD CONSTRAINT "tester_call_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_media" ADD CONSTRAINT "tester_media_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_media" ADD CONSTRAINT "tester_media_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_media" ADD CONSTRAINT "tester_media_call_id_tester_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."tester_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_media" ADD CONSTRAINT "tester_media_message_id_tester_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."tester_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_message" ADD CONSTRAINT "tester_message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_message" ADD CONSTRAINT "tester_message_settled_update_id_project_update_id_fk" FOREIGN KEY ("settled_update_id") REFERENCES "public"."project_update"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_message" ADD CONSTRAINT "tester_message_removal_id_moderation_decision_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_message" ADD CONSTRAINT "tester_message_thread_fk" FOREIGN KEY ("project_id","tester_id") REFERENCES "public"."tester_thread"("project_id","tester_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_thread" ADD CONSTRAINT "tester_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tester_thread" ADD CONSTRAINT "tester_thread_tester_id_user_id_fk" FOREIGN KEY ("tester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tester_call_project_created_idx" ON "tester_call" USING btree ("project_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tester_media_call_idx" ON "tester_media" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "tester_media_message_idx" ON "tester_media" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "tester_media_pending_idx" ON "tester_media" USING btree ("project_id","owner_id") WHERE "tester_media"."call_id" is null and "tester_media"."message_id" is null;--> statement-breakpoint
CREATE INDEX "tester_message_thread_created_idx" ON "tester_message" USING btree ("project_id","tester_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tester_message_open_feedback_idx" ON "tester_message" USING btree ("project_id") WHERE "tester_message"."kind" = 'feedback' and "tester_message"."settled_at" is null and "tester_message"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "tester_thread_tester_idx" ON "tester_thread" USING btree ("tester_id");