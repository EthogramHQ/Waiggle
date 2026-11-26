// Les chargeurs des morceaux que des parties de page demandent (`lazyModule`, navigation/lazyModule.ts),
// écrits ici une fois chacun plutôt que dans chaque page. Le `import()` est le même que celui des
// routes (`app/*.tsx`) : le navigateur garde le morceau, et la page qui le demande à son tour le
// reçoit aussitôt.
//
// Pourquoi un fichier à part : sous Jest, un vrai `import()` échoue (« without
// --experimental-vm-modules »). Les tests de page remplacent ce fichier entier (jest.setup.ts) par
// des chargeurs qui rendent le morceau par `require`, sans toucher au code de la page.

/** Le morceau des réglages : le rayon d'un membre, la feuille « Offrir du miel » (R19). */
export const loadSettingsChunk = () => import('./chunks/settings')

/** Le morceau de l'éditeur de projet : la danse de publication (R6a), jouée après « Publier ». */
export const loadProjectEditorChunk = () => import('./chunks/projectEditor')

/** Le morceau des Éclaireuses : le bouton de la Goutte, pour une Éclaireuse seulement (R20). */
export const loadScoutChunk = () => import('./chunks/scout')
