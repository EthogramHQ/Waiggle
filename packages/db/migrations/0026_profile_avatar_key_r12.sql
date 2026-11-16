-- R12 « Les projets publics » : un index sur la clé de fichier de l'avatar (`profile.avatar_key`).
-- Un visiteur sans compte qui ouvre une photo de profil (/media/avatars/…) fait chercher le profil
-- qui la porte (routes/media.ts, `isAvatarShownToVisitor`) ; sans index, chaque photo demandée
-- lirait toute la table. Écrite par drizzle-kit, sans reprise à la main : un index ne change aucune
-- ligne existante ; les profils sans photo (avatar_key nul) y figurent aussi, sans gêne.
CREATE INDEX "profile_avatar_key_idx" ON "profile" USING btree ("avatar_key");
