// La page d'entrée (tranche R2), commune à « Se connecter » (/sign-in) et « Créer un compte »
// (/sign-up). Sur le miel vif : la langue et le retour sur le miel ; sur ordinateur, la scène
// d'accueil à gauche et le panneau en carte à droite, avec ses deux onglets (AuthPanel).
// L'adresse suit l'onglet : changer d'onglet remplace la page (/sign-in ↔ /sign-up), et le relais
// (accounts/authHandoff.ts) passe à la nouvelle ce qui était tapé et le focus de l'onglet.
import { contactEmail, sourceUrl } from '@ruche/brand'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'
import {
  type AuthDraft,
  type AuthTab,
  emptyDraft,
  leaveHandoff,
  takeHandoff,
} from '../accounts/authHandoff'
import { useOpenOutside } from '../navigation/links'
import { firstParam } from '../navigation/params'
import { useGoBack } from '../navigation/useGoBack'
import { AuthPanel } from '../ui/AuthPanel'
import { Hint } from '../ui/Hint'
import { IconButton } from '../ui/IconButton'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { WelcomeHero } from '../ui/WelcomeHero'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'

const pathOf = (tab: AuthTab) => (tab === 'signIn' ? '/sign-in' : '/sign-up')

export function AuthScreen({ tab: initial }: { tab: AuthTab }) {
  const { t } = useTranslation()
  const router = useRouter()
  const back = useGoBack('/')
  const openOutside = useOpenOutside()
  // La carte à onglets (ordinateur) ; sur téléphone, un formulaire et un lien vers l'autre.
  const { card } = useLayout()
  // La page où revenir après la connexion (?next=…) : elle suit d'un onglet à l'autre.
  const next = firstParam(useLocalSearchParams<{ next?: string | string[] }>().next)

  // Le relais laissé par l'onglet d'avant, lu une seule fois (valeur initiale de useState).
  const [handoff] = useState(() => takeHandoff(initial))
  const [tab, setTab] = useState<AuthTab>(initial)
  const [draft, setDraft] = useState<AuthDraft>(handoff ?? emptyDraft)
  // useCallback garde la même fonction d'un affichage à l'autre : le formulaire d'inscription s'en
  // sert dans un effet, qui ne doit pas se relancer à chaque lettre tapée.
  // Rien ne change (le code du lien, reposé à chaque affichage) : on rend le même objet, et React ne
  // redessine pas (sinon l'effet qui le pose se relancerait sans fin).
  const onDraft = useCallback(
    (patch: Partial<AuthDraft>) =>
      setDraft((current) =>
        Object.entries(patch).every(([key, value]) => current[key as keyof AuthDraft] === value)
          ? current
          : { ...current, ...patch },
      ),
    [],
  )

  const switchTo = (to: AuthTab) => {
    if (to === tab) return
    setTab(to)
    leaveHandoff(to, draft)
    // replace : l'onglet change l'adresse sans empiler de page (« retour » ramène d'où l'on vient).
    router.replace(next ? { pathname: pathOf(to), params: { next } } : pathOf(to))
  }

  const titles = {
    signIn: t(($) => $.auth.signIn.title),
    signUp: t(($) => $.auth.signUp.title),
  }
  // Sur téléphone, le lien vers l'autre formulaire ; sur la carte, ce sont les onglets.
  const toOther = (to: AuthTab) => (card ? undefined : () => switchTo(to))

  return (
    <Screen
      ambiance="brand"
      // Le titre de l'onglet du navigateur suit l'onglet choisi (jur-15, WCAG 2.4.2).
      pageTitle={titles[tab]}
      header={
        <Row justify="between" align="center">
          <IconButton icon="arrow-left" label={t(($) => $.common.back)} onPress={back} />
          <LanguageSwitcher compact visitor />
        </Row>
      }
      hero={
        <WelcomeHero
          tagline={t(($) => $.home.tagline)}
          source={{
            note: t(($) => $.home.openSource),
            link: t(($) => $.home.seeCode),
            onPress: () => openOutside(sourceUrl),
          }}
        />
      }
    >
      <AuthPanel
        // Le nom de la rangée d'onglets, lu par les lecteurs d'écran : « Connexion ou inscription ».
        label={t(($) => $.auth.tabs.label)}
        tabs={[
          {
            key: 'signIn',
            label: t(($) => $.auth.tabs.signIn),
            content: <SignInForm draft={draft} onDraft={onDraft} onSignUp={toOther('signUp')} />,
          },
          {
            key: 'signUp',
            label: t(($) => $.auth.tabs.signUp),
            content: <SignUpForm draft={draft} onDraft={onDraft} onSignIn={toOther('signIn')} />,
          },
        ]}
        selected={tab}
        onSelect={switchTo}
        focusOnMount={handoff !== null}
      />
      <Stack gap="sm">
        <Hint icon="lock-simple" text={t(($) => $.home.membersOnly)} />
        {/* Tranche 7a (règle 23) : l'adresse de contact, lisible sans compte ; R2 : c'est un lien
            qui ouvre la messagerie (notre propre adresse : pas de page « Tu quittes… »). */}
        <Hint
          icon="envelope-simple"
          text={t(($) => $.auth.contact)}
          link={{
            label: contactEmail,
            onPress: () => void Linking.openURL(`mailto:${contactEmail}`),
          }}
        />
      </Stack>
      {/* Sur téléphone, pas de scène à gauche : le lien vers le code source se place ici. */}
      {card ? null : (
        <Row gap="xs" justify="center" wrap>
          <Text variant="caption" tone="muted">
            {t(($) => $.home.openSource)}
          </Text>
          <TextLink
            label={t(($) => $.home.seeCode)}
            onPress={() => openOutside(sourceUrl)}
            external
          />
        </Row>
      )}
    </Screen>
  )
}
