-- R6a : la feuille de publication. On AJOUTE seulement des colonnes, toutes facultatives : les
-- projets et les photos existants gardent NULL (« pas de catégorie », « pas de description »),
-- aucune ligne n'est réécrite. « time_spent » reste en place, plus lue ni écrite : son DROP COLUMN
-- part en R6b, pour qu'un retour à l'image d'avant le déploiement démarre encore.
ALTER TABLE "project" ADD COLUMN "primary_category" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "secondary_category" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "difficulty" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "started_on" text;--> statement-breakpoint
ALTER TABLE "project_media" ADD COLUMN "description" text;