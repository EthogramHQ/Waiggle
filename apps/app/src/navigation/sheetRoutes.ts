// Les pages ouvertes en feuille, posées sur la page d'où l'on vient (R6a à R10), en un seul endroit :
// la pile de `app/_layout.tsx` les déclare d'après cette liste, et les passages de page (R17,
// ui/pageTransition) n'animent jamais un passage qui part d'une feuille ou y mène (la page dessous
// reste dessinée, et la feuille anime elle-même son entrée).

/** Le nom de chaque feuille dans la pile d'Expo Router (le chemin de son fichier sous `app/`). */
export const sheetRoutes = [
  'projects/new',
  'projects/[id]/edit',
  'projects/[id]/update',
  'projects/[id]/testers/new-call',
  'projects/[id]/testers/new-feedback',
  'report',
  'suspend',
  'hives/new',
  'hives/[id]/invite',
] as const
export type SheetRoute = (typeof sheetRoutes)[number]

// Une « expression régulière » par feuille : `[id]` devient « un segment quelconque », le reste
// doit être identique. `projects/new` est essayée avant `projects/[id]/…` ; l'ordre ne change rien
// ici, car aucune feuille n'est un simple `projects/[id]`.
const patterns = sheetRoutes.map(
  (route) => new RegExp(`^/${route.replace(/\[[^\]]+\]/g, '[^/]+')}/?$`),
)

/** Vrai si cette adresse (sans la requête ni le fragment) est celle d'une feuille. */
export const isSheetPath = (pathname: string): boolean => {
  const path = pathname.split(/[?#]/)[0] ?? ''
  return patterns.some((pattern) => pattern.test(path))
}
