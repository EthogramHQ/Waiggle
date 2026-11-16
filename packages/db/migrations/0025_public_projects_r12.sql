-- R12 « Les projets publics » : la visibilité `web` (« Public », lisible sans compte), admise par
-- un nouveau `check` et entrée dans les deux index partiels de « ce que voient les membres » (refaits :
-- un index partiel ne change pas de condition, il s'efface et se recrée), plus un index des seuls
-- projets `web` pour les lectures d'un visiteur ; la page publique d'un membre (cinq cases de
-- `profile`) ; la vitrine de l'accueil (`showcase`, quatre places) et ses traces d'Activité
-- (`showcase_notice`) ; le refus de la vitrine par l'auteur (`project.showcase_declined_at`) ;
-- l'adresse e-mail facultative d'un visiteur qui signale (`content_report.reporter_email`), avec son
-- index unique partiel (un signalement ouvert par adresse et par cible) et un `check` qui ne la
-- garde jamais à côté d'un membre. Écrite par drizzle-kit, sans reprise à la main : aucun projet
-- n'est encore `web` (le `check` passe sur toutes les lignes, dont la visibilité vient de Zod) ;
-- chaque page reste fermée (`public_page` faux par défaut : rien n'est public sans l'accord du
-- membre), les autres cases prennent leur défaut ; la vitrine est vide ; les colonnes de date et
-- d'adresse restent vides.
CREATE TABLE "showcase" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"position" smallint NOT NULL,
	"added_at" timestamp NOT NULL,
	"added_by" text,
	CONSTRAINT "showcase_position_check" CHECK ("showcase"."position" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "showcase_notice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
DROP INDEX "project_public_published_idx";--> statement-breakpoint
DROP INDEX "project_shared_published_idx";--> statement-breakpoint
ALTER TABLE "content_report" ADD COLUMN "reporter_email" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "public_page" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "public_bio" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "public_tools" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "public_projects" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "public_follower_count" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "showcase_declined_at" timestamp;--> statement-breakpoint
ALTER TABLE "showcase" ADD CONSTRAINT "showcase_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase" ADD CONSTRAINT "showcase_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_notice" ADD CONSTRAINT "showcase_notice_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_notice" ADD CONSTRAINT "showcase_notice_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_position_idx" ON "showcase" USING btree ("position");--> statement-breakpoint
CREATE INDEX "showcase_notice_member_idx" ON "showcase_notice" USING btree ("member_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "showcase_notice_project_idx" ON "showcase_notice" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "showcase_notice_created_idx" ON "showcase_notice" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_report_visitor_target_idx" ON "content_report" USING btree ("target_kind","target_id",lower("reporter_email")) WHERE "content_report"."status" = 'open' and "content_report"."reporter_email" is not null;--> statement-breakpoint
CREATE INDEX "project_web_published_idx" ON "project" USING btree ("published_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "project"."visibility" = 'web' and "project"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_public_published_idx" ON "project" USING btree ("published_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "project"."visibility" in ('public', 'web');--> statement-breakpoint
CREATE INDEX "project_shared_published_idx" ON "project" USING btree ("published_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "project"."visibility" in ('public', 'hive', 'web') and "project"."removed_at" is null;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_visitor_email_check" CHECK ("content_report"."reporter_email" is null or "content_report"."reporter_id" is null);--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_visibility_check" CHECK ("project"."visibility" in ('public', 'hive', 'private', 'web'));