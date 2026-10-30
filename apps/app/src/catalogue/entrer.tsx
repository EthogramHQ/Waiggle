// La section « Entrer » du catalogue (tranche R2) : le panneau d'entrée (AuthPanel) dans ses deux
// présentations, onglets (la carte d'ordinateur) et formulaire seul (téléphone), et le lien qui
// quitte l'appli (TextLink `external`, « Voir le code »). Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne : plusieurs agents y travaillent en même temps. Ses exemples (un outil
// de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthPanel } from '../ui/AuthPanel'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'

const fr = {
  title: 'Entrer',
  tabs: 'Panneau d’entrée, sur la carte d’ordinateur : deux onglets',
  single: 'Panneau d’entrée, sur téléphone : le formulaire de la page seul',
  label: 'Connexion ou inscription',
  signIn: 'Se connecter',
  signUp: 'Créer un compte',
  signInBody: 'Te revoilà : adresse, mot de passe, « Me connecter ».',
  signUpBody: 'Créer ton compte : code, nom affiché, adresse, mot de passe.',
  external: 'Lien qui quitte l’appli : une flèche, et « ouvre un site externe » pour les lecteurs',
  seeCode: 'Voir le code',
}
const en: typeof fr = {
  title: 'Entering',
  tabs: 'Entry panel, on the computer card: two tabs',
  single: 'Entry panel, on a phone: the page form alone',
  label: 'Sign in or sign up',
  signIn: 'Sign in',
  signUp: 'Create an account',
  signInBody: 'Welcome back: address, password, “Sign in”.',
  signUpBody: 'Create your account: code, display name, address, password.',
  external: 'Link that leaves the app: an arrow, and “opens an external site” for screen readers',
  seeCode: 'See the code',
}

type Key = 'signIn' | 'signUp'

export function EntryCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const [tab, setTab] = useState<Key>('signIn')
  const [single, setSingle] = useState<Key>('signUp')
  const tabs = [
    { key: 'signIn' as const, label: l.signIn, content: <Text>{l.signInBody}</Text> },
    { key: 'signUp' as const, label: l.signUp, content: <Text>{l.signUpBody}</Text> },
  ]
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.tabs}</Text>
      <Surface variant="plain" padding="xl">
        <AuthPanel
          label={l.label}
          tabs={tabs}
          selected={tab}
          onSelect={setTab}
          presentation="tabs"
        />
      </Surface>
      <Text tone="secondary">{l.single}</Text>
      <Surface variant="plain" padding="xl">
        <AuthPanel
          label={l.label}
          tabs={tabs}
          selected={single}
          onSelect={setSingle}
          presentation="single"
        />
      </Surface>
      <Text tone="secondary">{l.external}</Text>
      <TextLink label={l.seeCode} onPress={() => undefined} external />
    </Stack>
  )
}
