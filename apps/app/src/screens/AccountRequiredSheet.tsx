// La feuille « Compte requis » (tranche R12, scénario « Réagir, commenter, suivre », planche
// R12-Compte-Requis) : un visiteur sans compte a touché « Réagir » ou « Créer un compte » sur un
// projet public. La page la pose dans ses couches (`layers` de `ProjectPageLayout`).
//
// De haut en bas : le titre, qui dit tout (« Pour réagir, crée ton compte », Q11) ; trois pastilles
// qui montrent ce qu'un compte permet (« Waggle ! », « Commenter », « Suivre ses mises à jour ») ; la
// limite (« Waiggle s'ouvre sur invitation. », Q12) ; « Créer un compte » en miel, puis « Se
// connecter » ; enfin « Rien n'est public sans ton accord. ».
//
// Les pastilles sont du texte, pas des boutons : rien ne se fait à la place du visiteur, aucune
// réaction n'est gardée pour plus tard (Q11). Une fois connecté, il revient sur la page du projet
// (`?next=`, accepté par `navigation/next.ts`) et réagit lui-même.
//
// À l'ouverture, le focus va au titre (plan R12, relecture de l'interface) : la feuille n'a pas de
// champ, et « Fermer », premier élément dessiné, ne dit rien de ce qu'elle demande.
import { usePathname, useRouter } from 'expo-router'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { nextAfterSignIn } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import type { Focusable } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { Mascot } from '../ui/Mascot'
import { Sheet } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Tag } from '../ui/Tag'

type Props = {
  open: boolean
  onClose: () => void
}

export function AccountRequiredSheet({ open, onClose }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  // usePathname : le chemin de la page du projet (« /fr/projects/abc »), sans ses paramètres.
  const pathname = usePathname()
  const titleRef = useRef<Focusable>(null)

  // Une feuille se ferme avant de changer de page : ouverte par-dessus la page de connexion, elle
  // garderait le focus et le voile.
  const signUp = () => {
    onClose()
    router.push('/sign-up')
  }
  const signIn = () => {
    onClose()
    // push (et non replace) : « Retour » depuis la connexion ramène aussi sur le projet.
    router.push({ pathname: '/sign-in', params: { next: nextAfterSignIn(pathname) } })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(($) => $.visitor.accountRequired.title)}
      // Une feuille courte : sur téléphone, la hauteur de son contenu, collée en bas.
      compact
      // L'abeille qui salue, à côté du titre : un décor, le titre dit tout.
      decoration={<Mascot pose="wave" size="sm" decorative />}
      titleRef={titleRef}
      initialFocusRef={titleRef}
      footer={
        <Stack gap="sm">
          <Button label={t(($) => $.visitor.signUp)} onPress={signUp} />
          <Button label={t(($) => $.visitor.signIn)} variant="secondary" onPress={signIn} />
          <Hint icon="lock-simple" text={t(($) => $.home.membersOnly)} />
        </Stack>
      }
    >
      <Stack gap="md">
        <Row gap="sm" wrap>
          <Tag label={t(($) => $.project.reactions.bravo)} icon="sparkle" kind="category" />
          <Tag label={t(($) => $.project.comments.addShort)} icon="chat-circle" kind="category" />
          <Tag label={t(($) => $.visitor.accountRequired.follow)} icon="bell" kind="category" />
        </Row>
        <Hint icon="key" text={t(($) => $.visitor.accountRequired.inviteOnly)} />
      </Stack>
    </Sheet>
  )
}
