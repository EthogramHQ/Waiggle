// La section « Pages d'un visiteur » du catalogue (tranche R12, planches R12-Visiteur-Projet et
// R12-Visiteur-Projet-Desktop) : les pièces d'une page publique vue sans compte, de jour et de nuit.
// - la barre du haut (`VisitorBar`), sur téléphone (deux pilules de verre sur la photo) et sur
//   ordinateur (la capsule), avec et sans l'action de la page (« Partager ») ;
// - les réactions (`ReactionSummary`) : beaucoup, une seule, aucune ;
// - la phrase posée à la place des commentaires (`MembersOnlyNotice`).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : le catalogue est partagé par
// toute l'interface. Ses légendes (un outil de développement, absent de l'appli publiée) sont
// écrites ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { IconButton } from '../ui/IconButton'
import { MembersOnlyNotice } from '../ui/MembersOnlyNotice'
import { ReactionSummary } from '../ui/ReactionSummary'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'
import { VisitorBar } from '../ui/VisitorBar'

const fr = {
  title: 'Pages d’un visiteur',
  barPhone: 'La barre du haut sur téléphone, posée sur la photo du projet',
  barPhoneShare: 'La même, avec l’action de la page (« Partager »)',
  barDesktop: 'La barre du haut sur ordinateur : la capsule de verre',
  reactionsMany: 'Les réactions : le nombre seul, jamais qui',
  reactionsOne: 'Une seule réaction',
  reactionsNone: 'Aucune réaction encore',
  membersOnly: 'À la place des commentaires',
  share: 'Partager',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Visitor pages',
  barPhone: 'The top bar on a phone, over the project photo',
  barPhoneShare: 'The same, with the action of the page (“Share”)',
  barDesktop: 'The top bar on a computer: the glass capsule',
  reactionsMany: 'The reactions: the number only, never who',
  reactionsOne: 'A single reaction',
  reactionsNone: 'No reaction yet',
  membersOnly: 'In place of the comments',
  share: 'Share',
  day: 'day',
  night: 'night',
}

/**
 * La page d'un projet public, pour l'exemple : un toucher sur le logo ou « Se connecter » quitte
 * vraiment le catalogue, comme les liens de `LegalLinks` dans sa section.
 */
const page = '/fr/projects/p-decollage'

/** Le catalogue n'ouvre pas de feuille : « Réagir » et « Créer un compte » ne font rien. */
const noop = () => {}

const schemes = ['day', 'night'] as const

export function VisitorCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const home = i18n.language === 'en' ? '/en/' : '/fr/'
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="lg">
            <Example caption={`${l.barPhone} — ${l[scheme]}`} narrow>
              <VisitorBar homeHref={home} next={page} variant="phone" />
            </Example>
            <Example caption={`${l.barPhoneShare} — ${l[scheme]}`} narrow>
              <VisitorBar
                homeHref={home}
                next={page}
                variant="phone"
                action={
                  <IconButton icon="share-network" label={l.share} variant="glass" onPress={noop} />
                }
              />
            </Example>
            <Example caption={`${l.barDesktop} — ${l[scheme]}`}>
              <VisitorBar homeHref={home} next={page} variant="desktop" />
            </Example>
            <Example caption={`${l.reactionsMany} — ${l[scheme]}`} narrow>
              <ReactionSummary count={54} onReact={noop} />
            </Example>
            <Example caption={`${l.reactionsOne} — ${l[scheme]}`} narrow>
              <ReactionSummary count={1} onReact={noop} />
            </Example>
            <Example caption={`${l.reactionsNone} — ${l[scheme]}`} narrow>
              <ReactionSummary count={0} onReact={noop} />
            </Example>
            <Example caption={`${l.membersOnly} — ${l[scheme]}`} narrow>
              <MembersOnlyNotice onCreateAccount={noop} />
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un exemple sur le fond de son thème ; `narrow` : à la largeur d'un téléphone. */
function Example({
  caption,
  children,
  narrow = false,
}: {
  caption: string
  children: ReactNode
  narrow?: boolean
}) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {/* La largeur d'un téléphone (390 points), sans déborder d'un catalogue plus étroit. */}
      {narrow ? <View style={{ width: '100%', maxWidth: 390 }}>{children}</View> : children}
    </Surface>
  )
}
