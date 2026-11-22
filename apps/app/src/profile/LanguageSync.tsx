// Composant invisible, placé une fois à la racine de l'appli : dès qu'un membre est connecté, il
// applique la langue enregistrée sur son compte. Ainsi, choisir l'anglais sur son téléphone suffit
// pour retrouver l'anglais sur l'ordinateur.
//
// R18 : dans le navigateur, l'anglais arrive à la demande (`ensureLanguage` de `@ruche/i18n`). On
// attend ses textes avant de changer de langue : pendant ce temps, l'écran garde la sienne, jamais
// un mélange. S'ils n'arrivent pas (réseau coupé), l'écran reste dans sa langue, sans message : le
// membre n'a rien demandé à cet instant, et les Réglages lui permettent de choisir à nouveau.
import { ensureLanguage } from '@ruche/i18n'
import { useContext, useEffect } from 'react'
import { I18nContext, useTranslation } from 'react-i18next'
import { useSession } from '../accounts/api'
import { useMe } from './hooks'

export function LanguageSync() {
  // L'instance posée par la racine, telle quelle : c'est elle qui reçoit les textes (voir
  // useChooseLanguage) ; `useTranslation` n'en rend qu'un relais.
  const { i18n: relay } = useTranslation()
  const i18n = useContext(I18nContext)?.i18n ?? relay
  const { data: session } = useSession()
  // Pour un visiteur (pas de session), useMe ne fait aucune requête.
  const { data: me } = useMe(Boolean(session))
  const saved = me?.language

  // S'exécute quand la langue enregistrée arrive (ou change), pas à chaque affichage.
  useEffect(() => {
    if (!saved || saved === i18n.language) return
    // Une autre langue enregistrée avant l'arrivée des textes (le membre a changé d'avis ailleurs) :
    // l'ancienne attente ne change plus rien.
    let cancelled = false
    ensureLanguage(i18n, saved).then(
      () => {
        if (!cancelled) void i18n.changeLanguage(saved)
      },
      () => {
        // L'écran garde sa langue : rien à défaire.
      },
    )
    return () => {
      cancelled = true
    }
  }, [saved, i18n])

  return null // rien à afficher
}
