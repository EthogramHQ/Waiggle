// Les brouillons du coin des testeurs (R7b) : ce qu'on a commencé à écrire (un appel, un retour, une
// réponse) et qu'on retrouve en rouvrant la feuille. Le magasin vit en mémoire seulement, jamais sur
// l'appareil : un brouillon est un texte privé, et un appareil partagé ne doit pas le garder après la
// déconnexion (`clearAllDrafts`, appelée par `signOut`).
import { useCallback, useState } from 'react'

// Le magasin : une table clé → valeur, partagée par toute l'appli tant qu'elle reste ouverte.
const store = new Map<string, unknown>()

/**
 * La clé d'un brouillon : le membre, le projet et la sorte (`call`, `feedback`, `reply`), plus le
 * testeur quand il y a un fil par testeur. Le membre est dans la clé : deux comptes qui se suivent
 * sur le même appareil ne se voient jamais, même si un oubli de nettoyage survenait un jour.
 */
export const draftKey = (
  memberId: string,
  projectId: string,
  kind: string,
  testerId?: string,
): string => `${memberId}:${projectId}:${kind}${testerId ? `:${testerId}` : ''}`

/** Le brouillon gardé sous cette clé, ou `undefined` s'il n'y en a pas. */
export const readDraft = <T>(key: string): T | undefined => store.get(key) as T | undefined

/** Garde un brouillon (remplace le précédent). */
export const writeDraft = <T>(key: string, value: T): void => {
  store.set(key, value)
}

/** Oublie le brouillon de cette clé (après l'envoi, ou « Effacer le brouillon »). */
export const clearDraft = (key: string): void => {
  store.delete(key)
}

/** Oublie tous les brouillons : à la déconnexion et à la suppression du compte. */
export const clearAllDrafts = (): void => {
  store.clear()
}

/**
 * Hook : `[valeur, changer, effacer]`. La valeur de départ est le brouillon gardé, sinon `empty`.
 * `changer` met à jour l'écran et le magasin ; `effacer` oublie le brouillon et revient à `empty`.
 * `empty` peut être écrit en ligne : il n'est lu qu'au besoin, jamais comparé d'un rendu à l'autre.
 */
export const useDraft = <T>(key: string, empty: T): [T, (value: T) => void, () => void] => {
  const [state, setState] = useState(() => ({ key, value: readDraft<T>(key) ?? empty }))
  // Autre clé (on passe d'un fil à un autre) : on repart du brouillon de cette clé, pendant le rendu
  // (le moyen recommandé par React pour « réinitialiser un état quand une valeur change »).
  let current = state
  if (state.key !== key) {
    current = { key, value: readDraft<T>(key) ?? empty }
    setState(current)
  }

  const set = useCallback(
    (value: T) => {
      writeDraft(key, value)
      setState({ key, value })
    },
    [key],
  )
  // `clear` ne dépend pas de `empty` (il resterait instable si `empty` est écrit en ligne) : il vide
  // l'état, et la lecture plus bas remet `empty`.
  const clear = useCallback(() => {
    clearDraft(key)
    setState({ key, value: undefined as T })
  }, [key])

  // Après `clear`, la valeur n'est plus qu'un trou : on la remplace par `empty` à la lecture.
  const value = current.value === undefined ? empty : current.value
  return [value, set, clear]
}
