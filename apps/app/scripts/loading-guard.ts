// Le garde des captures : une capture qui montre encore « Chargement… », ou « Cette page n’a pas pu
// se charger », n'est pas une capture de la page, mais de son attente ou de sa panne. Le script des
// captures (shots.mjs) lit le texte visible de la page juste avant de la photographier et appelle
// loadingProblem : une réponse non nulle fait échouer le script, avec le nom de la capture.
//
// Pourquoi : en tranche 7c, les données simulées des pages « suspendre » et « lever » étaient
// invalides ; les deux captures montraient le chargement puis la panne, et tout restait vert.
//
// Ce fichier est à part, sans dépendance au navigateur, pour que son test (loading-guard.test.ts)
// l'appelle sans lancer tout le script des captures. Il est en TypeScript, comme les données de
// src/testing/ : Node le lit directement (il efface les types), Jest et tsc le vérifient.
//
// `import type` n'importe qu'un type : il disparaît à l'exécution, Node n'a donc pas à charger le
// paquet des textes (dont l'entrée importe sans extension, ce que Node refuse).
import type { Translation } from '@ruche/i18n'

/**
 * Les textes d'une page qui n'a pas fini de se charger, lus dans les traductions (jamais recopiés :
 * s'ils changent, le garde suit) : son chargement (LoadingScreen et les listes), son échec
 * (LoadErrorScreen), dans src/screens/states.tsx, et le lancement de l'appli (« Waiggle se
 * lance… », le logo animé de ui/LoadingLogo.tsx).
 *
 * Attention : depuis Miel 2 (R1), le chargement d'une page est un squelette, et le lancement un
 * logo ; « Chargement… » et « Waiggle se lance… » y sont des noms pour les lecteurs d'écran
 * (aria-label), absents d'innerText. Pour les voir, le texte passé à loadingProblem doit aussi
 * contenir le nom des éléments occupés (`[aria-busy="true"]`) de la page.
 */
export const unfinishedTexts = (translation: Translation): string[] => [
  translation.common.loading,
  translation.states.errorTitle,
  translation.common.loadingApp,
]

// Les blancs ramenés à une espace simple : le navigateur peut rendre une espace insécable (celles
// de la typographie française) comme une espace ordinaire dans innerText, ou l'inverse.
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Une ligne entière égale au texte, où un paramètre (`{{appName}}`) vaut n'importe quel mot : les
 * traductions sont lues brutes, sans le nom de l'appli (que ce script n'importe pas).
 */
const lineOf = (text: string) => {
  const pattern = normalize(text)
    .split(/\{\{\w+\}\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\S+')
  return new RegExp(`^${pattern}$`)
}

/**
 * Le problème d'une capture, ou null si elle montre bien sa page.
 *
 * - name : le nom du fichier de la capture (« lever-telephone-nuit »), cité dans le message ;
 * - visibleText : le texte visible de la page (`innerText` du corps : une ligne par bloc, sans ce
 *   qui est caché) ;
 * - texts : les textes interdits (unfinishedTexts, dans la langue des captures) ;
 * - page, intended : le nom de la page, et celles qui montrent le chargement ou la panne exprès
 *   (le catalogue, l'état « erreur »), laissées passer.
 *
 * On compare des lignes entières : « Chargement des commentaires… » n'est pas « Chargement… ».
 */
export function loadingProblem(
  name: string,
  visibleText: string,
  {
    texts,
    page,
    intended = [],
  }: { texts: readonly string[]; page?: string; intended?: readonly string[] },
): string | null {
  if (page !== undefined && intended.includes(page)) return null
  const lines = visibleText.split('\n').map(normalize)
  const shown = texts.find((text) => {
    const line = lineOf(text)
    return lines.some((candidate) => line.test(candidate))
  })
  if (shown === undefined) return null
  return `${name} : la capture montre « ${shown} » (la page ne s'est pas chargée ; ses données simulées sont-elles valides ?)`
}
