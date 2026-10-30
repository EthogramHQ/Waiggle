// Le bouton d'un envoi qu'on ne peut refaire qu'à une heure dite (tranche R2, « Trop d'essais »,
// décision D3 ; relecture juridique jur-13 et relecture de l'interface C1). Bloqué, il est inactif
// et dit pourquoi : la phrase « Nouvel essai possible à 21 h 47 » s'affiche juste dessous, et le
// bouton la désigne comme sa description (aria-describedby sur le web) ou la lit en indice après
// son nom (téléphone, où aria-describedby n'existe pas). Sans lui, un lecteur d'écran entendait
// « Envoyer le lien, désactivé », sans savoir jusqu'à quand.
//
// Il réunit `Button` et `RetryAt`, que sept endroits de l'appli câblaient chacun à la main. Le
// temps, lui, reste tenu par l'écran (`useRetryAt`), qui sait quel refus a lancé l'attente.
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, type ButtonProps } from './Button'
import { formatRetryTime, RetryAt, type RetryState } from './RetryAt'

type Props = Omit<ButtonProps, 'describedById' | 'hint'> & {
  /** L'attente en cours, rendue par `useRetryAt` : bloqué ou non, et jusqu'à quand. */
  retry: RetryState
  /**
   * Le texte autour de l'heure, pour le catalogue seulement (un outil de développement, absent de
   * l'appli publiée) ; les écrans laissent le composant le traduire.
   */
  format?: (time: string) => string
}

export function RetryButton({ retry, format, disabled = false, ...button }: Props) {
  const { t, i18n } = useTranslation()
  // useId : l'identifiant de la phrase, stable entre le pré-rendu et le navigateur, que le bouton
  // désigne comme sa description.
  const phraseId = useId()
  const time = retry.until ? formatRetryTime(retry.until, i18n.language) : null
  // La même phrase que RetryAt, pour l'indice du bouton sur téléphone.
  const phrase =
    time === null ? undefined : format ? format(time) : t(($) => $.auth.retryAt, { time })
  // Le bouton ne renvoie à la phrase que tant qu'elle explique son blocage.
  const explained = retry.blocked && phrase !== undefined
  return (
    // Un fragment : le bouton et la phrase restent deux voisins du conteneur de l'écran (un pied
    // collé, une pile), qui les espace comme ses autres éléments.
    <>
      <Button
        {...button}
        disabled={disabled || retry.blocked}
        describedById={explained ? phraseId : undefined}
        hint={explained ? phrase : undefined}
      />
      {retry.until ? (
        <RetryAt until={retry.until} nativeID={phraseId} {...(format ? { format } : null)} />
      ) : null}
    </>
  )
}
