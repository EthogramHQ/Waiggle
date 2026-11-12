-- R8 « les notifications » : les notifications du catalogue (projet rangé, outil rattaché), les
-- choix d'e-mail par type, et la date du dernier e-mail « tout de suite ». Écrite par drizzle-kit,
-- complétée à la main : la reprise des choix d'avant R8, en fin de fichier.
CREATE TABLE "catalogue_notice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"kind" text NOT NULL,
	"project_id" uuid,
	"tool_id" uuid,
	"typed_name" text,
	"category_code" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "catalogue_notice_kind_check" CHECK (("catalogue_notice"."kind" = 'project_category' and "catalogue_notice"."project_id" is not null and "catalogue_notice"."category_code" is not null and "catalogue_notice"."tool_id" is null)
        or ("catalogue_notice"."kind" in ('tool_added', 'tool_merged') and "catalogue_notice"."tool_id" is not null and "catalogue_notice"."typed_name" is not null and "catalogue_notice"."project_id" is null))
);
--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_reactions" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_comments" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_replies" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_follows" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_updates" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_testers" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "recap_v2_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "instant_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalogue_notice" ADD CONSTRAINT "catalogue_notice_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_notice" ADD CONSTRAINT "catalogue_notice_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_notice" ADD CONSTRAINT "catalogue_notice_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_notice" ADD CONSTRAINT "catalogue_notice_category_code_category_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."category"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogue_notice_member_idx" ON "catalogue_notice" USING btree ("member_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_preference_instant_idx" ON "email_preference" USING btree ("user_id") WHERE "email_preference"."email_comments" = 'now' or "email_preference"."email_replies" = 'now' or "email_preference"."email_testers" = 'now';--> statement-breakpoint
ALTER TABLE "email_preference" ADD CONSTRAINT "email_preference_choices_check" CHECK ("email_preference"."email_comments" in ('now', 'digest', 'never')
        and "email_preference"."email_replies" in ('now', 'digest', 'never')
        and "email_preference"."email_testers" in ('now', 'digest', 'never')
        and "email_preference"."email_reactions" in ('digest', 'never')
        and "email_preference"."email_follows" in ('digest', 'never')
        and "email_preference"."email_updates" in ('digest', 'never'));--> statement-breakpoint
-- Reprise des choix de 6c (scénario R8 : « Un e-mail quand on me mentionne ou me répond » activé
-- devient « Réponses et mentions : Tout de suite », coupé reste « Dans le récap », la valeur par
-- défaut). La date du dernier e-mail de mentions devient celle du dernier e-mail « tout de suite » :
-- l'intervalle d'une heure continue. « mention_emails » et « mention_sent_at » restent, tenues à
-- jour en copie par l'API, pour qu'un retour à la version d'avant R8 marche sans restauration.
UPDATE "email_preference" SET "email_replies" = 'now' WHERE "mention_emails";--> statement-breakpoint
UPDATE "email_preference" SET "instant_sent_at" = "mention_sent_at";
