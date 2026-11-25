-- R19 (décision du 23/11, « depuis le choix ») : l'heure du choix du défi perso. Le défi ne compte
-- que les gestes faits depuis : un défi choisi jeudi ne compte plus ceux de lundi. Une colonne
-- neuve, nulle tant que rien n'est choisi, et pour « Pas cette semaine ».
ALTER TABLE "personal_challenge" ADD COLUMN "chosen_at" timestamp;--> statement-breakpoint
-- Écrit à la main : les défis déjà choisis reçoivent l'heure de leur tirage (`created_at`), le plus
-- tôt où le choix a pu se faire, faute de connaître la vraie. Ils comptent donc les gestes faits
-- depuis la première lecture de la semaine. Les lignes des semaines passées partent à la purge de
-- nuit ; « Pas cette semaine » (`none`) et « rien encore » restent à null.
UPDATE "personal_challenge" SET "chosen_at" = "created_at"
  WHERE "chosen" IS NOT NULL AND "chosen" <> 'none';
