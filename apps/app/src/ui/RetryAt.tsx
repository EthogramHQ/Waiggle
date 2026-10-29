// « Trop d'essais » (tranche R2) : quand le serveur refuse une connexion ou un envoi pour un temps
// (en-tête `Retry-After`), l'écran dit à quelle heure réessayer, « Nouvel essai possible à 21:47 »,
// et son bouton reste inactif jusque-là, puis se libère tout seul (décision D3 du 29/10/2026).
// Une heure fixe plutôt qu'un compte à rebours : un texte qui change chaque seconde est relu sans
// fin par les lecteurs d'écran et attire l'œil pour rien (WCAG 2.2.2) ; l'heure, elle, reste la
// même tant qu'on attend, et son nom lu aussi.
//
// Deux morceaux : le hook `useRetryAt`, qui tient le temps (bloqué ou non, jusqu'à quand), et le
// composant `RetryAt`, qui écrit l'heure dans la langue de l'appli.
import { space } from '@ruche/brand'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Icon } from './Icon'
import { Text } from './Text'

/** Ce que le hook rend à l'écran : s'il doit encore attendre, et jusqu'à quand. */
export type RetryState = {
  /** Vrai tant que l'heure n'est pas passée : le bouton reste inactif. */
  blocked: boolean
  /** L'heure à partir de laquelle réessayer, ou null quand rien ne bloque. */
  until: Date | null
}

/**
 * Hook : à partir du délai donné par le serveur (en secondes, null quand il n'y en a pas), l'heure
 * à laquelle réessayer. Un nouveau délai (un nouveau refus) repart de maintenant ; à l'heure dite,
 * `blocked` repasse à faux de lui-même, sans geste du membre.
 */
export const useRetryAt = (retryAfterSeconds: number | null): RetryState => {
  const [until, setUntil] = useState<Date | null>(null)
  // useEffect : à chaque nouveau délai, on calcule l'heure et on pose un minuteur qui libère ; le
  // minuteur est retiré si un autre délai arrive avant, ou si l'écran se ferme.
  useEffect(() => {
    if (retryAfterSeconds === null || retryAfterSeconds <= 0) {
      setUntil(null)
      return
    }
    const ms = retryAfterSeconds * 1000
    setUntil(new Date(Date.now() + ms))
    const timer = setTimeout(() => setUntil(null), ms)
    return () => clearTimeout(timer)
  }, [retryAfterSeconds])
  return { blocked: until !== null, until }
}

type Props = {
  /** L'heure à partir de laquelle réessayer (`until` du hook). */
  until: Date
  /**
   * Le texte autour de l'heure, pour le catalogue seulement (un outil de développement, absent de
   * l'appli publiée) ; les écrans laissent le composant le traduire.
   */
  format?: (time: string) => string
}

/**
 * L'heure écrite dans la langue (« 21:47 » en français, « 9:47 PM » en anglais) : Intl.DateTimeFormat
 * est la mise en forme des dates propre à chaque langue, fournie par l'appareil.
 */
export const formatRetryTime = (until: Date, language: string): string =>
  new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(until)

/**
 * La phrase « Nouvel essai possible à 21:47 », annoncée comme un état (`status` : les lecteurs
 * d'écran la lisent quand elle paraît, sans interrompre). Son nom ne change pas tant qu'on attend.
 */
export function RetryAt({ until, format }: Props) {
  const { t, i18n } = useTranslation()
  const time = formatRetryTime(until, i18n.language)
  const text = format ? format(time) : t(($) => $.auth.retryAt, { time })
  return (
    // accessible : la phrase est lue d'un seul tenant (l'horloge est décorative).
    <View
      accessible
      role="status"
      accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
    >
      <Icon name="clock" size={18} tone="secondary" />
      <View style={{ flexShrink: 1 }}>
        {/* tabular : les chiffres ont tous la même largeur, l'heure ne tremble pas. */}
        <Text variant="callout" tone="secondary" tabular>
          {text}
        </Text>
      </View>
    </View>
  )
}
