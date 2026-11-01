// Le relais entre la connexion et l'inscription (tranche R2). Sur ordinateur, ce sont deux onglets
// du même panneau, et l'adresse suit l'onglet (/sign-in, /sign-up) : changer d'onglet change donc
// de page, et Expo Router monte un écran neuf. Ce relais lui passe ce qui était déjà tapé
// (l'adresse, le nom, le code d'invitation, jamais le mot de passe) et lui dit de rendre le focus
// à l'onglet : pour le membre, rien n'a bougé.
//
// Un simple objet du module, en mémoire : rien n'est écrit sur l'appareil, et le relais ne sert
// qu'une fois (lu, il est effacé).

export type AuthTab = 'signIn' | 'signUp'

/** Ce qui passe d'un onglet à l'autre. */
export type AuthDraft = { email: string; name: string; inviteCode: string }

export const emptyDraft: AuthDraft = { email: '', name: '', inviteCode: '' }

let handoff: { to: AuthTab; draft: AuthDraft } | null = null

/** Laisse le brouillon à l'écran de l'onglet `to`, qui va s'ouvrir. */
export const leaveHandoff = (to: AuthTab, draft: AuthDraft): void => {
  handoff = { to, draft }
}

/**
 * Reprend le brouillon laissé pour cet onglet, et l'efface. Un relais laissé pour l'autre onglet
 * est périmé (la page a été ouverte autrement) : il est effacé aussi.
 */
export const takeHandoff = (tab: AuthTab): AuthDraft | null => {
  const taken = handoff
  handoff = null
  return taken && taken.to === tab ? taken.draft : null
}
