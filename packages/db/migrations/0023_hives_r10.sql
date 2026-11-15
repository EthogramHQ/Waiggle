-- R10 « Ruches » : les ruches, leurs membres, leurs invitations (une invitation refusée reste
-- comptée jusqu'à ses 30 jours) et les traces gardées pour l'Activité ; la visibilité « Une ruche »
-- d'un projet (`hive_id`, avec sa contrainte) ; « Ne pas me proposer aux autres » ; le type d'e-mail
-- « Ruches », « now » par défaut, entré dans l'index de l'e-mail « tout de suite » ; deux index sur
-- `removal_id` des photos, pour la purge des décisions (noté en R9). Écrite par drizzle-kit : aucun
-- projet n'est réservé à une ruche, les colonnes neuves ont leur défaut, sauf `email_hives`, repris
-- à la main pour les membres qui avaient déjà baissé leurs e-mails (voir juste après son ajout).
CREATE TABLE "hive" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_removal_id" uuid,
	"name_set_by" text,
	"icon" text NOT NULL,
	"animator_id" text,
	"invite_policy" text DEFAULT 'members' NOT NULL,
	"pinned_project_id" uuid,
	"pinned_by" text,
	"pinned_at" timestamp,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "hive_icon_check" CHECK ("hive"."icon" in ('house-line', 'heart', 'users-three', 'baby', 'coffee', 'book-open', 'game-controller', 'music-notes', 'rocket-launch', 'leaf', 'camera', 'code')),
	CONSTRAINT "hive_invite_policy_check" CHECK ("hive"."invite_policy" in ('members', 'animator'))
);
--> statement-breakpoint
CREATE TABLE "hive_invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hive_id" uuid NOT NULL,
	"invitee_id" text NOT NULL,
	"inviter_id" text,
	"created_at" timestamp NOT NULL,
	"refused_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hive_member" (
	"hive_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"invited_by" text,
	"joined_at" timestamp NOT NULL,
	"seen_at" timestamp,
	CONSTRAINT "hive_member_hive_id_user_id_pk" PRIMARY KEY("hive_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hive_notice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"hive_id" uuid,
	"hive_name" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "hive_notice_kind_check" CHECK ("hive_notice"."kind" in ('removed', 'animator', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "email_preference" DROP CONSTRAINT "email_preference_choices_check";--> statement-breakpoint
DROP INDEX "email_preference_instant_idx";--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "email_hives" text DEFAULT 'now' NOT NULL;--> statement-breakpoint
-- Reprise des données, ajoutée à la main (R10, relecture juridique) : « Ruches » vaut « Tout de
-- suite » par défaut, mais un membre qui avait déjà baissé ses e-mails ne doit pas en recevoir un
-- de plus sans l'avoir choisi. On respecte donc un refus déjà exprimé. `updated_at` n'est écrit
-- que par un réglage ou un lien « Ne plus recevoir » (la prise du récap crée la ligne sans lui) :
-- non nul, le membre a touché à ses réglages. S'il n'a mis aucun type « tout de suite » à `now`,
-- « Ruches » suit son choix : `never` s'il a tout coupé (ses six types), sinon `digest`. Les
-- autres, et les membres sans ligne, gardent le défaut `now` du scénario.
UPDATE "email_preference" SET "email_hives" = CASE
		WHEN "email_reactions" = 'never' AND "email_comments" = 'never' AND "email_replies" = 'never'
			AND "email_follows" = 'never' AND "email_updates" = 'never' AND "email_testers" = 'never'
		THEN 'never'
		ELSE 'digest'
	END
	WHERE "updated_at" IS NOT NULL
		AND 'now' NOT IN ("email_comments", "email_replies", "email_testers");--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "hide_from_suggestions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "hive_id" uuid;--> statement-breakpoint
ALTER TABLE "hive" ADD CONSTRAINT "hive_name_removal_id_moderation_decision_id_fk" FOREIGN KEY ("name_removal_id") REFERENCES "public"."moderation_decision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive" ADD CONSTRAINT "hive_name_set_by_user_id_fk" FOREIGN KEY ("name_set_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive" ADD CONSTRAINT "hive_animator_id_user_id_fk" FOREIGN KEY ("animator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive" ADD CONSTRAINT "hive_pinned_project_id_project_id_fk" FOREIGN KEY ("pinned_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive" ADD CONSTRAINT "hive_pinned_by_user_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive" ADD CONSTRAINT "hive_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_invitation" ADD CONSTRAINT "hive_invitation_hive_id_hive_id_fk" FOREIGN KEY ("hive_id") REFERENCES "public"."hive"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_invitation" ADD CONSTRAINT "hive_invitation_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_invitation" ADD CONSTRAINT "hive_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_member" ADD CONSTRAINT "hive_member_hive_id_hive_id_fk" FOREIGN KEY ("hive_id") REFERENCES "public"."hive"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_member" ADD CONSTRAINT "hive_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_member" ADD CONSTRAINT "hive_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_notice" ADD CONSTRAINT "hive_notice_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_notice" ADD CONSTRAINT "hive_notice_hive_id_hive_id_fk" FOREIGN KEY ("hive_id") REFERENCES "public"."hive"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hive_created_by_idx" ON "hive" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "hive_invitation_hive_invitee_idx" ON "hive_invitation" USING btree ("hive_id","invitee_id");--> statement-breakpoint
CREATE INDEX "hive_invitation_invitee_idx" ON "hive_invitation" USING btree ("invitee_id","created_at");--> statement-breakpoint
CREATE INDEX "hive_invitation_inviter_idx" ON "hive_invitation" USING btree ("inviter_id","created_at");--> statement-breakpoint
CREATE INDEX "hive_member_user_idx" ON "hive_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hive_member_invited_by_idx" ON "hive_member" USING btree ("invited_by","joined_at");--> statement-breakpoint
CREATE INDEX "hive_notice_recipient_idx" ON "hive_notice" USING btree ("recipient_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "hive_notice_hive_idx" ON "hive_notice" USING btree ("hive_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_hive_id_hive_id_fk" FOREIGN KEY ("hive_id") REFERENCES "public"."hive"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_hive_created_idx" ON "project" USING btree ("hive_id","created_at") WHERE "project"."visibility" = 'hive';--> statement-breakpoint
CREATE INDEX "project_shared_published_idx" ON "project" USING btree ("published_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "project"."visibility" in ('public', 'hive') and "project"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_media_removal_idx" ON "project_media" USING btree ("removal_id") WHERE "project_media"."removal_id" is not null;--> statement-breakpoint
CREATE INDEX "tester_media_removal_idx" ON "tester_media" USING btree ("removal_id") WHERE "tester_media"."removal_id" is not null;--> statement-breakpoint
CREATE INDEX "email_preference_instant_idx" ON "email_preference" USING btree ("user_id") WHERE "email_preference"."email_comments" = 'now' or "email_preference"."email_replies" = 'now' or "email_preference"."email_testers" = 'now' or "email_preference"."email_hives" = 'now';--> statement-breakpoint
ALTER TABLE "email_preference" ADD CONSTRAINT "email_preference_choices_check" CHECK ("email_preference"."email_comments" in ('now', 'digest', 'never')
        and "email_preference"."email_replies" in ('now', 'digest', 'never')
        and "email_preference"."email_testers" in ('now', 'digest', 'never')
        and "email_preference"."email_hives" in ('now', 'digest', 'never')
        and "email_preference"."email_reactions" in ('digest', 'never')
        and "email_preference"."email_follows" in ('digest', 'never')
        and "email_preference"."email_updates" in ('digest', 'never'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_hive_check" CHECK (("project"."visibility" = 'hive') = ("project"."hive_id" is not null));