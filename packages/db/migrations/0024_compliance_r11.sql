-- R11 « La conformité » : les accords aux règles (une ligne par version acceptée, l'âge déclaré
-- toujours vrai), la dernière visite d'un membre et la date de l'e-mail « compte inactif », avec
-- l'index que lit la tâche de nuit, et le réglage « Découvertes » du récap, entré dans le `check`
-- des choix. Écrite par drizzle-kit : aucun membre n'a encore d'accord (l'écran « Accepter » le lui
-- demandera), `inactive_notice_at` reste vide, `discoveries` prend son défaut `digest` (rien ne
-- change sans le choix du membre) ; seule `last_active_at` est reprise à la main, juste après son
-- ajout. Les défauts de date sont en heure UTC sans fuseau, comme ce qu'écrit l'API.
CREATE TABLE "rules_acceptance" (
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp DEFAULT (now() at time zone 'utc') NOT NULL,
	"age_declared" boolean NOT NULL,
	CONSTRAINT "rules_acceptance_user_id_version_pk" PRIMARY KEY("user_id","version"),
	CONSTRAINT "rules_acceptance_age_declared_check" CHECK ("rules_acceptance"."age_declared")
);
--> statement-breakpoint
ALTER TABLE "email_preference" DROP CONSTRAINT "email_preference_choices_check";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_active_at" timestamp DEFAULT (now() at time zone 'utc') NOT NULL;--> statement-breakpoint
-- Reprise des données, ajoutée à la main (choix 6 du plan R11) : sans elle, chaque compte
-- existant aurait pour dernière visite l'heure de la migration, et un compte abandonné depuis des
-- années gagnerait 3 ans de plus avant sa suppression. On prend donc la plus récente des dates que
-- la base connaît déjà : la dernière activité d'une de ses sessions (Better Auth la met à jour quand
-- il la prolonge), sa dernière lecture du fil « Abonnements » (`feed_state`, R4), et à défaut la
-- création du compte. `greatest` rend la plus grande de ses valeurs en ignorant les nulles (pas de
-- session, jamais lu le fil). Les deux sous-requêtes suivent un index chacune : `session_userId_idx`
-- et la clé primaire de `feed_state`. L'index sur `last_active_at` n'est créé qu'après (plus bas) :
-- le construire une fois sur les valeurs finales coûte moins que le tenir à jour ligne à ligne.
UPDATE "user" SET "last_active_at" = greatest(
		"user"."created_at",
		(SELECT max("session"."updated_at") FROM "session" WHERE "session"."user_id" = "user"."id"),
		(SELECT "feed_state"."read_at" FROM "feed_state" WHERE "feed_state"."member_id" = "user"."id")
	);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "inactive_notice_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_preference" ADD COLUMN "discoveries" text DEFAULT 'digest' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules_acceptance" ADD CONSTRAINT "rules_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_last_active_idx" ON "user" USING btree ("last_active_at");--> statement-breakpoint
ALTER TABLE "email_preference" ADD CONSTRAINT "email_preference_choices_check" CHECK ("email_preference"."email_comments" in ('now', 'digest', 'never')
        and "email_preference"."email_replies" in ('now', 'digest', 'never')
        and "email_preference"."email_testers" in ('now', 'digest', 'never')
        and "email_preference"."email_hives" in ('now', 'digest', 'never')
        and "email_preference"."email_reactions" in ('digest', 'never')
        and "email_preference"."email_follows" in ('digest', 'never')
        and "email_preference"."email_updates" in ('digest', 'never')
        and "email_preference"."discoveries" in ('digest', 'never'));