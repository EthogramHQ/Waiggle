// La section « Le compte » du catalogue (tranche R2) : les composants nouveaux de l'entrée et des
// réglages, dans tous leurs états. Les onglets (Tabs, sur le miel et sur une surface), la colonne
// des rubriques (SettingsNav : colonne sur ordinateur, liste sur téléphone), la feuille (SheetPanel
// ouverte dans la page, en disposition téléphone et ordinateur, et la vraie Sheet par un bouton),
// « Nouvel essai possible à… » (RetryAt bloqué, puis libéré de lui-même), et le pied collé d'un écran
// (ScreenFooter, un et deux boutons). Fichier à part de CatalogueScreen.tsx, qui l'importe en une
// ligne : plusieurs agents y travaillent en même temps. Ses exemples (un outil de développement,
// absent de l'appli publiée) sont écrits ici, en français et en anglais, et passés en props : les
// textes de la tranche arrivent par un autre commit.
import { radii, space } from '@ruche/brand'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { Hint } from '../ui/Hint'
import { RetryAt, useRetryAt } from '../ui/RetryAt'
import { ScreenFooter } from '../ui/Screen'
import { SettingsNav } from '../ui/SettingsNav'
import { Sheet, SheetPanel } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Tabs } from '../ui/Tabs'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useTheme } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Le compte',
  tabs: 'Onglets : sur le miel (verre), puis sur une surface (groupé)',
  tabsLabel: 'Connexion ou inscription',
  signIn: 'Se connecter',
  signUp: 'Créer un compte',
  signInBody: 'Te revoilà. Connecte-toi pour retrouver les projets de tes proches.',
  signUpBody: 'Bienvenue. Quelques questions, et ton compte est prêt.',
  nav: 'Rubriques des réglages : colonne sur ordinateur, liste sur téléphone (« Sécurité » ouverte)',
  navLabel: 'Rubriques des réglages',
  profile: 'Mon profil',
  notifications: 'Notifications',
  language: 'Langue',
  appearance: 'Apparence',
  data: 'Mes données',
  security: 'Sécurité',
  account: 'Compte',
  about: 'À propos',
  sheetPhone:
    'Feuille, disposition téléphone : poignée, « Fermer », titre, contenu qui défile, pied collé',
  sheetDesktop: 'Feuille, disposition ordinateur : panneau centré',
  sheetOpen: 'Ouvrir la feuille',
  sheetTitle: 'Supprimer ton compte',
  sheetSubtitle: 'Voici ce qui disparaît avec lui.',
  sheetBody: 'Tes projets, tes notes et tes commentaires. Ton pseudo redevient libre.',
  sheetField: 'Confirme avec ton mot de passe',
  sheetConfirm: 'Supprimer définitivement',
  cancel: 'Annuler',
  close: 'Fermer',
  emailSheetTitle: 'Changer d’adresse',
  emailSheetBody: 'Un lien partira vers la nouvelle adresse pour la confirmer.',
  emailField: 'Nouvelle adresse e-mail',
  send: 'Envoyer le lien',
  retry:
    '« Nouvel essai possible à… » : bloqué (heure fixe, aucun décompte), puis libéré de lui-même',
  retryText: (time: string) => `Nouvel essai possible à ${time}`,
  simulate: 'Simuler un refus de 6 secondes',
  released: 'Libéré : le bouton est de nouveau actif.',
  connect: 'Se connecter',
  footer: 'Pied collé d’un écran (téléphone) : un bouton, puis deux',
  save: 'Enregistrer',
  change: 'Changer le mot de passe',
}

const en: typeof fr = {
  title: 'The account',
  tabs: 'Tabs: on the honey (glass), then on a surface (grouped)',
  tabsLabel: 'Sign in or sign up',
  signIn: 'Sign in',
  signUp: 'Create an account',
  signInBody: 'Welcome back. Sign in to find your friends’ projects.',
  signUpBody: 'Welcome. A few questions, and your account is ready.',
  nav: 'Settings sections: a column on desktop, a list on phone (“Security” open)',
  navLabel: 'Settings sections',
  profile: 'My profile',
  notifications: 'Notifications',
  language: 'Language',
  appearance: 'Appearance',
  data: 'My data',
  security: 'Security',
  account: 'Account',
  about: 'About',
  sheetPhone: 'Sheet, phone layout: handle, “Close”, title, scrolling content, pinned footer',
  sheetDesktop: 'Sheet, desktop layout: centred panel',
  sheetOpen: 'Open the sheet',
  sheetTitle: 'Delete your account',
  sheetSubtitle: 'Here is what goes with it.',
  sheetBody: 'Your projects, your notes and your comments. Your handle becomes free again.',
  sheetField: 'Confirm with your password',
  sheetConfirm: 'Delete for good',
  cancel: 'Cancel',
  close: 'Close',
  emailSheetTitle: 'Change address',
  emailSheetBody: 'A link will go to the new address to confirm it.',
  emailField: 'New e-mail address',
  send: 'Send the link',
  retry: '“You can try again at…”: blocked (fixed time, no countdown), then released by itself',
  retryText: (time: string) => `You can try again at ${time}`,
  simulate: 'Simulate a 6-second refusal',
  released: 'Released: the button is active again.',
  connect: 'Sign in',
  footer: 'Pinned footer of a screen (phone): one button, then two',
  save: 'Save',
  change: 'Change the password',
}

/** Le délai du refus simulé, en secondes : assez court pour voir la libération. */
const SIMULATED_RETRY_AFTER = 6
/** L'heure fixe de l'état bloqué : dans un quart d'heure. */
const BLOCKED_FOR_MS = 15 * 60 * 1000
/** La hauteur donnée à la feuille « téléphone » posée dans la page. */
const PHONE_SHEET_HEIGHT = 560

type TabKey = 'sign-in' | 'sign-up'
type SectionKey =
  | 'profile'
  | 'notifications'
  | 'language'
  | 'appearance'
  | 'data'
  | 'security'
  | 'account'
  | 'about'

export function AccountCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const { colors } = useTheme()
  const [tab, setTab] = useState<TabKey>('sign-in')
  const [groupedTab, setGroupedTab] = useState<TabKey>('sign-up')
  const [sheetOpen, setSheetOpen] = useState(false)
  // Le refus simulé : null tant qu'on n'a pas appuyé ; le hook libère tout seul au bout du délai.
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const retry = useRetryAt(retryAfter)
  const [blockedUntil] = useState(() => new Date(Date.now() + BLOCKED_FOR_MS))

  const tabs = [
    { key: 'sign-in' as const, label: l.signIn, content: <Text>{l.signInBody}</Text> },
    { key: 'sign-up' as const, label: l.signUp, content: <Text>{l.signUpBody}</Text> },
  ]

  const sections: { key: SectionKey; label: string; href: string }[] = [
    { key: 'profile', label: l.profile, href: '/settings/profile' },
    { key: 'notifications', label: l.notifications, href: '/settings/notifications' },
    { key: 'language', label: l.language, href: '/settings/language' },
    { key: 'appearance', label: l.appearance, href: '/settings/appearance' },
    { key: 'data', label: l.data, href: '/settings/data' },
    { key: 'security', label: l.security, href: '/settings/security' },
    { key: 'account', label: l.account, href: '/settings/account' },
    { key: 'about', label: l.about, href: '/settings/about' },
  ]

  const deleteFooter = (
    <>
      <Button label={l.sheetConfirm} variant="confirm" icon="trash" onPress={() => {}} />
      <View style={{ alignItems: 'center' }}>
        <TextLink label={l.cancel} role="button" onPress={() => setSheetOpen(false)} />
      </View>
    </>
  )

  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>

      <Text tone="secondary">{l.tabs}</Text>
      {/* Les onglets sur le miel : un coin de miel vif, comme l'écran de connexion. */}
      <View style={{ backgroundColor: colors.honey, borderRadius: radii.tile, padding: space.xl }}>
        <Tabs label={l.tabsLabel} tabs={tabs} selected={tab} onSelect={setTab} />
      </View>
      <Tabs
        label={l.tabsLabel}
        tabs={tabs}
        selected={groupedTab}
        onSelect={setGroupedTab}
        variant="grouped"
      />

      <Text tone="secondary">{l.nav}</Text>
      <SettingsNav label={l.navLabel} items={sections} current="security" />

      <Text tone="secondary">{l.sheetPhone}</Text>
      <View
        style={{
          height: PHONE_SHEET_HEIGHT,
          backgroundColor: colors.scrim,
          borderRadius: radii.tile,
          overflow: 'hidden',
        }}
      >
        <SheetPanel
          layout="phone"
          title={l.sheetTitle}
          subtitle={l.sheetSubtitle}
          closeLabel={l.close}
          onClose={() => {}}
          footer={deleteFooter}
        >
          <Text>{l.sheetBody}</Text>
          <TextField label={l.sheetField} value="" onChangeText={() => {}} secureTextEntry />
        </SheetPanel>
      </View>

      <Text tone="secondary">{l.sheetDesktop}</Text>
      <View
        style={{
          backgroundColor: colors.scrim,
          borderRadius: radii.tile,
          paddingVertical: space.xxxl,
        }}
      >
        <SheetPanel
          layout="desktop"
          title={l.emailSheetTitle}
          closeLabel={l.close}
          onClose={() => {}}
          footer={<Button label={l.send} onPress={() => {}} />}
        >
          <Text>{l.emailSheetBody}</Text>
          <TextField
            label={l.emailField}
            value=""
            onChangeText={() => {}}
            keyboardType="email-address"
          />
        </SheetPanel>
      </View>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={l.sheetOpen} variant="secondary" onPress={() => setSheetOpen(true)} />
      </View>
      <Sheet
        open={sheetOpen}
        title={l.sheetTitle}
        subtitle={l.sheetSubtitle}
        closeLabel={l.close}
        onClose={() => setSheetOpen(false)}
        footer={deleteFooter}
      >
        <Text>{l.sheetBody}</Text>
        <TextField label={l.sheetField} value="" onChangeText={() => {}} secureTextEntry />
      </Sheet>

      <Text tone="secondary">{l.retry}</Text>
      <RetryAt until={blockedUntil} format={l.retryText} />
      <Stack gap="sm">
        <View style={{ alignSelf: 'flex-start' }}>
          <Button
            label={l.simulate}
            variant="secondary"
            onPress={() => setRetryAfter(SIMULATED_RETRY_AFTER)}
            disabled={retry.blocked}
          />
        </View>
        {retry.until ? <RetryAt until={retry.until} format={l.retryText} /> : null}
        {retryAfter !== null && !retry.blocked ? (
          <Hint icon="check-circle" text={l.released} />
        ) : null}
        <Button label={l.connect} onPress={() => {}} disabled={retry.blocked} />
      </Stack>

      <Text tone="secondary">{l.footer}</Text>
      <ScreenFooter>
        <Button label={l.save} onPress={() => {}} />
      </ScreenFooter>
      <ScreenFooter>
        <Button label={l.change} onPress={() => {}} />
        <Button label={l.cancel} variant="secondary" onPress={() => {}} />
      </ScreenFooter>
    </Stack>
  )
}
