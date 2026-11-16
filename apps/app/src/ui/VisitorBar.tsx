// La barre du haut d'un visiteur sans compte (tranche R12, planches R12-Visiteur-Projet et
// R12-Visiteur-Projet-Desktop ; plan R12, décision 12) : le logo, qui ramène à l'accueil dans la
// langue de la page, et « Se connecter », qui revient ensuite sur la page.
//
// La barre des membres (`navigation/TopNav`) lit la session et le profil (`useMe`), et ne dessine
// rien sans session. Celle-ci ne lit ni l'une ni l'autre : une page publique ne demande jamais rien
// au serveur au nom d'un visiteur, et la barre ne peut pas boucler sur une lecture en panne.
//
// Deux allures, comme sur les planches :
// - téléphone : deux pilules de verre posées sur la photo, « Waiggle » (l'abeille et le nom) à
//   gauche, « Se connecter » à droite ;
// - tablette et ordinateur : la capsule de verre de la barre des membres, le logo et le mot à
//   gauche, « Se connecter » en blanc à droite (le miel reste à « Tester la démo », la seule action
//   miel de la page).
// Les deux se lisent comme des liens : ils mènent à une autre page.
//
// Un composant de src/ui ne connaît pas la navigation de l'appli (`pnpm arch`) : la page lui donne
// les adresses (`homeHref` par `publicPath`, `next` par son chemin) ; la barre les ouvre par le
// routeur, comme `LegalLinks`.
import { appName, textStyles } from '@ruche/brand'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Logo } from './Logo'
import { Row, Stack } from './Stack'
import { Surface } from './Surface'
import { useLayout } from './theme/layout'
import { Wordmark } from './Wordmark'

type Props = {
  /** L'accueil dans la langue de la page (`/fr/`, `/en/`), où mène le logo. */
  homeHref: string
  /** Le chemin de la page affichée (`/fr/projects/<id>`), où revenir après la connexion (`?next=`). */
  next: string
  /** Une action de la page, posée avant « Se connecter » (« Partager », sur téléphone). */
  action?: ReactNode
  /**
   * L'allure, pour le catalogue seulement (il montre les deux à toute largeur) ; les écrans la
   * laissent déduire de la largeur : téléphone sous 700 points, et avant l'hydratation (web), comme
   * le pré-rendu, qui ne connaît pas la fenêtre (`useLayout`).
   */
  variant?: 'phone' | 'desktop'
}

/** La hauteur de l'abeille dans la pilule de téléphone : celle d'une ligne de bouton. */
const BEE_SIZE = textStyles.button.lineHeight

export function VisitorBar({ homeHref, next, action, variant }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  const phone = variant ? variant === 'phone' : sizeClass === 'compact'
  const goHome = () => router.push(homeHref)
  // push (et non replace) : le retour depuis la connexion ramène aussi sur cette page.
  const signIn = () => router.push({ pathname: '/sign-in', params: { next } })
  const signInLabel = t(($) => $.visitor.signIn)

  if (phone) {
    return (
      <Row justify="between" align="center" gap="sm" wrap>
        <Button
          label={appName}
          role="link"
          variant="glass"
          size="compact"
          // L'abeille est un décor : le nom de l'appli est lu.
          leading={<Logo variant="bee" size={BEE_SIZE} decorative />}
          onPress={goHome}
        />
        <Row gap="sm" align="center">
          {action}
          <Button label={signInLabel} role="link" variant="glass" size="compact" onPress={signIn} />
        </Row>
      </Row>
    )
  }

  return (
    // Le rayon `sheet` : celui de la capsule des membres (TopNav), une pilule sur une ligne, sans
    // rogner ce qu'elle contient quand le texte agrandi la fait passer sur deux.
    <Surface variant="glass" radius="sheet" padding="sm">
      <Row gap="md" paddingX="sm" align="center" wrap>
        <Wordmark logo onPress={goHome} />
        {/* Une place vide qui pousse le reste à droite. */}
        <Stack grow>{null}</Stack>
        <Row gap="sm" align="center">
          {action}
          <Button
            label={signInLabel}
            role="link"
            variant="secondary"
            size="compact"
            onPress={signIn}
          />
        </Row>
      </Row>
    </Surface>
  )
}
