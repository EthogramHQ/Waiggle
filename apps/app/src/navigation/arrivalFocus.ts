// Le focus à l'arrivée sur une page (R18), vu depuis la navigation : le module vit dans
// ui/arrivalFocus.ts, parce que `Screen` (dans `src/ui`, qui n'a pas le droit d'importer
// `navigation/`) le lit aussi. Ce fichier le réexporte tel quel : une seule instance, un seul état.
export {
  ARRIVAL_MAX,
  focusAfterPopState,
  focusArrival,
  focusArrivalTitle,
  rememberOrigin,
  resetArrivalFocus,
  returnFocus,
  useArrivalTitle,
} from '../ui/arrivalFocus'
