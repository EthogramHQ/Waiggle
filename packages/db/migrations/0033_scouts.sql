-- R20 « Les Éclaireuses » : cinq tables neuves (les Éclaireuses, le mois, les missions, les
-- retours, les missions faites) et, dans le jeu de R19, les listes fermées élargies (trois gestes,
-- deux sources de pollen, le miel d'une danse entendue, le titre `scout` épinglable, trois avis) et
-- trois colonnes nulles de `game_notice` (le retour, le nombre de missions, le motif d'un retrait).
-- Rien à remplir à la main : les tables naissent vides (le mois n'a sa ligne qu'à son lancement), et
-- les contraintes remplacées acceptent toutes les lignes déjà là (elles ne font qu'ajouter des
-- valeurs). Chaque contrainte est effacée puis réécrite : PostgreSQL ne sait pas en modifier une.
CREATE TABLE "scout" (
	"member_id" text PRIMARY KEY NOT NULL,
	"joined_at" timestamp NOT NULL,
	"via" text NOT NULL,
	"removed_at" timestamp,
	"removal_reason" text,
	"show_drop" boolean DEFAULT true NOT NULL,
	CONSTRAINT "scout_via_check" CHECK ("scout"."via" in ('signup', 'settings')),
	CONSTRAINT "scout_removal_check" CHECK ("scout"."removal_reason" is null or ("scout"."removed_at" is not null and char_length("scout"."removal_reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "scout_mission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"week" date NOT NULL,
	"position" integer NOT NULL,
	"text_fr" text NOT NULL,
	"text_en" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "scout_mission_position_check" CHECK ("scout_mission"."position" between 1 and 3),
	CONSTRAINT "scout_mission_text_fr_check" CHECK (char_length("scout_mission"."text_fr") between 1 and 200),
	CONSTRAINT "scout_mission_text_en_check" CHECK ("scout_mission"."text_en" is null or char_length("scout_mission"."text_en") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "scout_mission_done" (
	"member_id" text NOT NULL,
	"mission_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "scout_mission_done_member_id_mission_id_pk" PRIMARY KEY("member_id","mission_id")
);
--> statement-breakpoint
CREATE TABLE "scout_program" (
	"id" integer PRIMARY KEY NOT NULL,
	"started_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	CONSTRAINT "scout_program_single_check" CHECK ("scout_program"."id" = 1),
	CONSTRAINT "scout_program_dates_check" CHECK ("scout_program"."ends_at" > "scout_program"."started_at")
);
--> statement-breakpoint
CREATE TABLE "scout_report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text,
	"text" text NOT NULL,
	"mission_id" uuid,
	"screen" text,
	"platform" text,
	"width" integer,
	"app_version" text,
	"language" text,
	"scheme" text,
	"media_key" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"fixed_note" text,
	"admin_note" text,
	"fixed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "scout_report_kind_check" CHECK ("scout_report"."kind" in ('bug', 'confusing', 'idea', 'love')),
	CONSTRAINT "scout_report_severity_check" CHECK (("scout_report"."kind" in ('bug', 'confusing') and "scout_report"."severity" in ('minor', 'annoying', 'blocking'))
        or ("scout_report"."kind" in ('idea', 'love') and "scout_report"."severity" is null)),
	CONSTRAINT "scout_report_text_check" CHECK (char_length("scout_report"."text") between 1 and 2000),
	CONSTRAINT "scout_report_screen_check" CHECK ("scout_report"."screen" is null or char_length("scout_report"."screen") <= 200),
	CONSTRAINT "scout_report_platform_check" CHECK ("scout_report"."platform" is null or "scout_report"."platform" in ('web', 'ios', 'android')),
	CONSTRAINT "scout_report_width_check" CHECK ("scout_report"."width" is null or "scout_report"."width" between 0 and 10000),
	CONSTRAINT "scout_report_app_version_check" CHECK ("scout_report"."app_version" is null or char_length("scout_report"."app_version") <= 64),
	CONSTRAINT "scout_report_language_check" CHECK ("scout_report"."language" is null or "scout_report"."language" in ('fr', 'en')),
	CONSTRAINT "scout_report_scheme_check" CHECK ("scout_report"."scheme" is null or "scout_report"."scheme" in ('day', 'night')),
	CONSTRAINT "scout_report_status_check" CHECK ("scout_report"."status" in ('sent', 'read', 'planned', 'fixed', 'parked')),
	CONSTRAINT "scout_report_fixed_note_check" CHECK ("scout_report"."fixed_note" is null or char_length("scout_report"."fixed_note") <= 300),
	CONSTRAINT "scout_report_admin_note_check" CHECK ("scout_report"."admin_note" is null or char_length("scout_report"."admin_note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "game_notice" DROP CONSTRAINT "game_notice_kind_check";--> statement-breakpoint
ALTER TABLE "game_notice" DROP CONSTRAINT "game_notice_payload_check";--> statement-breakpoint
ALTER TABLE "honey_entry" DROP CONSTRAINT "honey_entry_reason_check";--> statement-breakpoint
ALTER TABLE "honey_entry" DROP CONSTRAINT "honey_entry_amount_check";--> statement-breakpoint
ALTER TABLE "member_game" DROP CONSTRAINT "member_game_pinned_family_check";--> statement-breakpoint
ALTER TABLE "pollen_entry" DROP CONSTRAINT "pollen_entry_gesture_check";--> statement-breakpoint
ALTER TABLE "pollen_entry" DROP CONSTRAINT "pollen_entry_source_kind_check";--> statement-breakpoint
ALTER TABLE "game_notice" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "game_notice" ADD COLUMN "count" integer;--> statement-breakpoint
ALTER TABLE "game_notice" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "scout" ADD CONSTRAINT "scout_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_mission_done" ADD CONSTRAINT "scout_mission_done_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_mission_done" ADD CONSTRAINT "scout_mission_done_mission_id_scout_mission_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."scout_mission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_mission_done" ADD CONSTRAINT "scout_mission_done_report_id_scout_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."scout_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_report" ADD CONSTRAINT "scout_report_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_report" ADD CONSTRAINT "scout_report_mission_id_scout_mission_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."scout_mission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scout_mission_week_position_idx" ON "scout_mission" USING btree ("week","position");--> statement-breakpoint
CREATE INDEX "scout_mission_done_mission_idx" ON "scout_mission_done" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "scout_mission_done_report_idx" ON "scout_mission_done" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "scout_report_member_idx" ON "scout_report" USING btree ("member_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scout_report_status_idx" ON "scout_report" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scout_report_created_idx" ON "scout_report" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scout_report_mission_idx" ON "scout_report" USING btree ("mission_id") WHERE "scout_report"."mission_id" is not null;--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_report_id_scout_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."scout_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_notice_report_idx" ON "game_notice" USING btree ("report_id") WHERE "game_notice"."report_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "game_notice_scout_missions_idx" ON "game_notice" USING btree ("member_id","code") WHERE "game_notice"."kind" = 'scout_missions';--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_kind_check" CHECK ("game_notice"."kind" in ('intro', 'level', 'seal', 'hive_challenge', 'honey_gift', 'scout_heard', 'scout_missions', 'scout_removed'));--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_payload_check" CHECK (("game_notice"."kind" = 'intro')
        or ("game_notice"."kind" = 'level' and "game_notice"."level" is not null)
        or ("game_notice"."kind" = 'seal' and "game_notice"."code" is not null)
        or ("game_notice"."kind" = 'hive_challenge' and "game_notice"."hive_id" is not null and "game_notice"."code" is not null and "game_notice"."honey" is not null)
        or ("game_notice"."kind" = 'honey_gift' and "game_notice"."actor_id" is not null and "game_notice"."project_id" is not null)
        or ("game_notice"."kind" = 'scout_heard' and "game_notice"."report_id" is not null)
        or ("game_notice"."kind" = 'scout_missions' and "game_notice"."code" is not null and "game_notice"."count" between 1 and 3)
        or ("game_notice"."kind" = 'scout_removed' and char_length("game_notice"."reason") between 1 and 500));--> statement-breakpoint
ALTER TABLE "honey_entry" ADD CONSTRAINT "honey_entry_reason_check" CHECK ("honey_entry"."reason" in ('week', 'challenge', 'hive_challenge', 'scout_heard', 'gift', 'decoration'));--> statement-breakpoint
ALTER TABLE "honey_entry" ADD CONSTRAINT "honey_entry_amount_check" CHECK (("honey_entry"."reason" in ('week', 'challenge', 'hive_challenge', 'scout_heard') and "honey_entry"."amount" > 0)
        or ("honey_entry"."reason" in ('gift', 'decoration') and "honey_entry"."amount" < 0));--> statement-breakpoint
ALTER TABLE "member_game" ADD CONSTRAINT "member_game_pinned_family_check" CHECK ("member_game"."pinned_family" is null or "member_game"."pinned_family" in ('forager', 'builder', 'keeper', 'dancer', 'scout'));--> statement-breakpoint
ALTER TABLE "pollen_entry" ADD CONSTRAINT "pollen_entry_gesture_check" CHECK ("pollen_entry"."gesture" in ('feedback', 'feedback_settled', 'tester', 'comment', 'publish', 'update', 'reaction', 'follow', 'receive_feedback', 'receive_tester', 'receive_comment', 'receive_reaction', 'hive_created', 'invitation_accepted', 'invitation_joined', 'profile_photo', 'profile_bio', 'profile_tool', 'scout_report', 'scout_mission', 'scout_heard', 'challenge'));--> statement-breakpoint
ALTER TABLE "pollen_entry" ADD CONSTRAINT "pollen_entry_source_kind_check" CHECK ("pollen_entry"."source_kind" in ('reaction', 'comment', 'tester', 'tester_message', 'project', 'update', 'member', 'hive', 'invitation', 'profile', 'personal_challenge', 'scout_report', 'scout_mission'));