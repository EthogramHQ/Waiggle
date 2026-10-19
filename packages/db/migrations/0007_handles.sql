-- Tranche 6a (le pseudo) : une table neuve, sa clé étrangère et ses deux index.
-- Ajouté à la main, ce commentaire seulement : aucune ligne existante n'est touchée. Les membres
-- déjà inscrits reçoivent leur pseudo au démarrage de l'API (backfillHandles, dans
-- apps/api/src/handles/claim.ts) : il se fabrique à partir du nom, par du code JavaScript
-- (accents, numéros, mots réservés) qu'il serait fragile de récrire en SQL.
CREATE TABLE "member_handle" (
	"handle" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"claimed_at" timestamp NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "member_handle" ADD CONSTRAINT "member_handle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_handle_current_idx" ON "member_handle" USING btree ("user_id") WHERE "member_handle"."released_at" is null;--> statement-breakpoint
CREATE INDEX "member_handle_user_idx" ON "member_handle" USING btree ("user_id");