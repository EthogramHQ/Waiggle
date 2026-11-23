-- R19 « La gamification » : les sept tables du jeu, neuves et vides (le grand livre du pollen,
-- les sceaux, le miel, les défis perso et de ruche, les réglages du jeu, les avis de l'Activité).
-- Écrite par drizzle-kit : aucune ligne existante ne change. Le passé (pollen et sceaux de ce que
-- les membres ont déjà fait) est rattrapé par la migration suivante, 0030_game_backfill. Chaque
-- index est expliqué dans packages/db/src/schema/game.ts.
CREATE TABLE "game_notice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"kind" text NOT NULL,
	"level" integer,
	"code" text,
	"honey" integer,
	"actor_id" text,
	"project_id" uuid,
	"hive_id" uuid,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "game_notice_kind_check" CHECK ("game_notice"."kind" in ('intro', 'level', 'seal', 'hive_challenge', 'honey_gift')),
	CONSTRAINT "game_notice_payload_check" CHECK (("game_notice"."kind" = 'intro')
        or ("game_notice"."kind" = 'level' and "game_notice"."level" is not null)
        or ("game_notice"."kind" = 'seal' and "game_notice"."code" is not null)
        or ("game_notice"."kind" = 'hive_challenge' and "game_notice"."hive_id" is not null and "game_notice"."code" is not null and "game_notice"."honey" is not null)
        or ("game_notice"."kind" = 'honey_gift' and "game_notice"."actor_id" is not null and "game_notice"."project_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "hive_challenge" (
	"hive_id" uuid NOT NULL,
	"week" date NOT NULL,
	"code" text NOT NULL,
	"target" integer NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "hive_challenge_hive_id_week_pk" PRIMARY KEY("hive_id","week"),
	CONSTRAINT "hive_challenge_code_check" CHECK ("hive_challenge"."code" in ('feedback_5', 'updates_3', 'tested_3', 'reactions_10', 'comments_5')),
	CONSTRAINT "hive_challenge_target_check" CHECK ("hive_challenge"."target" > 0)
);
--> statement-breakpoint
CREATE TABLE "honey_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "honey_entry_reason_check" CHECK ("honey_entry"."reason" in ('week', 'challenge', 'hive_challenge', 'gift', 'decoration')),
	CONSTRAINT "honey_entry_amount_check" CHECK (("honey_entry"."reason" in ('week', 'challenge', 'hive_challenge') and "honey_entry"."amount" > 0)
        or ("honey_entry"."reason" in ('gift', 'decoration') and "honey_entry"."amount" < 0))
);
--> statement-breakpoint
CREATE TABLE "member_game" (
	"member_id" text PRIMARY KEY NOT NULL,
	"title_form" text DEFAULT 'f' NOT NULL,
	"pinned_family" text,
	"in_rankings" boolean DEFAULT true NOT NULL,
	"harvest_notices" boolean DEFAULT true NOT NULL,
	"decoration_tint" text,
	"decoration_pattern" text,
	"level_seen" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "member_game_title_form_check" CHECK ("member_game"."title_form" in ('f', 'm')),
	CONSTRAINT "member_game_pinned_family_check" CHECK ("member_game"."pinned_family" is null or "member_game"."pinned_family" in ('forager', 'builder', 'keeper', 'dancer')),
	CONSTRAINT "member_game_decoration_check" CHECK (("member_game"."decoration_tint" is null and "member_game"."decoration_pattern" is null)
        or ("member_game"."decoration_tint" in ('honey', 'amber', 'pollen') and "member_game"."decoration_pattern" in ('smooth', 'waffle', 'striped', 'dotted'))),
	CONSTRAINT "member_game_level_seen_check" CHECK ("member_game"."level_seen" > 0)
);
--> statement-breakpoint
CREATE TABLE "personal_challenge" (
	"member_id" text NOT NULL,
	"week" date NOT NULL,
	"offered" text[] NOT NULL,
	"chosen" text,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "personal_challenge_member_id_week_pk" PRIMARY KEY("member_id","week"),
	CONSTRAINT "personal_challenge_offered_check" CHECK (cardinality("personal_challenge"."offered") = 3 and "personal_challenge"."offered" <@ array['feedback', 'update', 'test', 'comment_3', 'react_5']::text[]),
	CONSTRAINT "personal_challenge_chosen_check" CHECK ("personal_challenge"."chosen" is null or "personal_challenge"."chosen" = 'none' or "personal_challenge"."chosen" = any("personal_challenge"."offered"))
);
--> statement-breakpoint
CREATE TABLE "pollen_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"gesture" text NOT NULL,
	"family" text NOT NULL,
	"amount" integer NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_key" text NOT NULL,
	"counterpart_id" text,
	"project_id" uuid,
	"day" date NOT NULL,
	"week" date NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"backfill" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pollen_entry_gesture_check" CHECK ("pollen_entry"."gesture" in ('feedback', 'feedback_settled', 'tester', 'comment', 'publish', 'update', 'reaction', 'follow', 'receive_feedback', 'receive_tester', 'receive_comment', 'receive_reaction', 'hive_created', 'invitation_accepted', 'invitation_joined', 'profile_photo', 'profile_bio', 'profile_tool', 'challenge')),
	CONSTRAINT "pollen_entry_family_check" CHECK ("pollen_entry"."family" in ('forager', 'builder', 'keeper', 'dancer')),
	CONSTRAINT "pollen_entry_source_kind_check" CHECK ("pollen_entry"."source_kind" in ('reaction', 'comment', 'tester', 'tester_message', 'project', 'update', 'member', 'hive', 'invitation', 'profile', 'personal_challenge')),
	CONSTRAINT "pollen_entry_amount_check" CHECK ("pollen_entry"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "seal" (
	"member_id" text NOT NULL,
	"code" text NOT NULL,
	"earned_at" timestamp NOT NULL,
	CONSTRAINT "seal_member_id_code_pk" PRIMARY KEY("member_id","code")
);
--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_notice" ADD CONSTRAINT "game_notice_hive_id_hive_id_fk" FOREIGN KEY ("hive_id") REFERENCES "public"."hive"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hive_challenge" ADD CONSTRAINT "hive_challenge_hive_id_hive_id_fk" FOREIGN KEY ("hive_id") REFERENCES "public"."hive"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honey_entry" ADD CONSTRAINT "honey_entry_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_game" ADD CONSTRAINT "member_game_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_challenge" ADD CONSTRAINT "personal_challenge_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pollen_entry" ADD CONSTRAINT "pollen_entry_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pollen_entry" ADD CONSTRAINT "pollen_entry_counterpart_id_user_id_fk" FOREIGN KEY ("counterpart_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seal" ADD CONSTRAINT "seal_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_notice_member_idx" ON "game_notice" USING btree ("member_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "game_notice_actor_idx" ON "game_notice" USING btree ("actor_id") WHERE "game_notice"."actor_id" is not null;--> statement-breakpoint
CREATE INDEX "hive_challenge_week_idx" ON "hive_challenge" USING btree ("week");--> statement-breakpoint
CREATE UNIQUE INDEX "honey_entry_once_idx" ON "honey_entry" USING btree ("member_id","source_key");--> statement-breakpoint
CREATE INDEX "personal_challenge_week_idx" ON "personal_challenge" USING btree ("week");--> statement-breakpoint
CREATE UNIQUE INDEX "pollen_entry_once_idx" ON "pollen_entry" USING btree ("member_id","gesture","source_key");--> statement-breakpoint
CREATE INDEX "pollen_entry_member_day_idx" ON "pollen_entry" USING btree ("member_id","day");--> statement-breakpoint
CREATE INDEX "pollen_entry_member_week_idx" ON "pollen_entry" USING btree ("member_id","week");--> statement-breakpoint
CREATE INDEX "pollen_entry_source_idx" ON "pollen_entry" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "pollen_entry_project_idx" ON "pollen_entry" USING btree ("project_id") WHERE "pollen_entry"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "pollen_entry_counterpart_idx" ON "pollen_entry" USING btree ("counterpart_id") WHERE "pollen_entry"."counterpart_id" is not null;--> statement-breakpoint
CREATE INDEX "pollen_entry_counterpart_week_idx" ON "pollen_entry" USING btree ("week") WHERE "pollen_entry"."counterpart_id" is not null;