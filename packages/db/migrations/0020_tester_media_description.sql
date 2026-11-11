-- R7b : la description lue à voix haute d'une photo d'appel (relecture juridique J8). La colonne est
-- nullable : les lignes existantes (aucune en production, le coin n'est pas encore ouvert) restent
-- sans description, comme une capture, et il n'y a rien à remplir.
ALTER TABLE "tester_media" ADD COLUMN "description" text;--> statement-breakpoint
-- Un index pour les plafonds de stockage du coin (100 photos d'appel par projet, 100 captures par fil).
CREATE INDEX "tester_media_project_owner_idx" ON "tester_media" USING btree ("project_id","owner_id","kind");
