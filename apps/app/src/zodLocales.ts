// Les langues des messages de Zod dans l'appli construite : l'anglais seul (tranche R18, « Les
// finitions », choix 4 du plan). Zod livre 64 langues dans `zod/v4/locales/index.js`, que son
// point d'entrée réexporte (`z.locales`) : tout le site les téléchargeait, environ 28 Ko compressés.
// metro.config.js remplace ce seul fichier, du seul paquet zod, par celui-ci.
//
// Rien ne change pour l'appli : elle lit le code d'une erreur (`issue.code`) et son chemin
// (`issue.path`), jamais le message écrit par Zod ; et Zod pose l'anglais par défaut ailleurs
// (`classic/schemas.js`, intact). Jest et `tsc` ne passent pas par Metro : ils gardent les 64.
//
// On importe le fichier de l'anglais par son chemin exact : passer par `zod/v4/locales` mènerait à
// l'index, que Metro remplace par ce fichier même.
export { default as en } from 'zod/v4/locales/en.js'
