// Outil de test pour les fenêtres gardées (Dialog `guardTaps`, tranche 7b) : leurs boutons ignorent
// les tapes pendant TAP_GUARD_MS après l'ouverture. Un test qui ouvre la fenêtre puis confirme dans
// la même milliseconde serait ignoré, comme une double tape : il attend d'abord la fin de la garde.
import { act } from '@testing-library/react-native'
import { TAP_GUARD_MS } from '../ui/Dialog'

/** Attend la fin de la garde de la fenêtre qui vient de s'ouvrir (de vraies millisecondes). */
export const passTapGuard = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, TAP_GUARD_MS)))
