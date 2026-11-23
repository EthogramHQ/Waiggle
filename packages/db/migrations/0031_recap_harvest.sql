-- R19 (relecture juridique du plan, J1) : la date du premier récap qui a porté « Ta semaine », pour
-- n'y écrire qu'une fois « Nouveau : ta récolte ». Une colonne neuve, nulle sur les lignes
-- existantes : chaque membre aura la note à son premier récap qui porte le bloc, ce qui est voulu.
ALTER TABLE "email_preference" ADD COLUMN "recap_harvest_at" timestamp;
