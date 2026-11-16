-- R12 : la langue d'un visiteur qui signale (« fr » ou « en »), gardée avec son adresse e-mail pour
-- que la décision lui arrive dans la langue de l'accusé. Colonne nulle : aucune ligne existante n'a
-- d'adresse de visiteur (la fonction n'était pas ouverte), donc rien à remplir ; une ligne sans
-- langue se lit « français », la langue de référence.
ALTER TABLE "content_report" ADD COLUMN "reporter_language" text;--> statement-breakpoint
-- Un index partiel sur les signalements clos qui ont encore une adresse : la décision, le classement
-- « sans objet » et la purge de nuit les cherchent pour envoyer la décision puis effacer l'adresse.
-- Il est presque toujours vide (une adresse ne survit pas à la clôture), donc la requête ne lit rien
-- d'autre. Il ne change aucune ligne existante.
CREATE INDEX "content_report_visitor_closed_idx" ON "content_report" USING btree ("id") WHERE "content_report"."reporter_email" is not null and "content_report"."status" <> 'open';
