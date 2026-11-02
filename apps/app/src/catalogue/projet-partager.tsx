// La section « Partager » du catalogue (tranche R5a, planche R5a-Partager) : la feuille de partage
// (ShareSheetPanel, la feuille sans sa couche modale), dans ses états :
// - un projet public, avec « Partager… » (le menu de l'appareil existe) et sans (Firefox sur
//   ordinateur) ;
// - un projet privé : le bandeau dit que le lien ne s'ouvrira que pour son auteur ;
// - la page d'un membre, sans photo (ses initiales) ;
// - une copie refusée : toucher « Copier le lien » de cet exemple montre le message du pied ;
// de jour et de nuit, puis sur ordinateur (panneau centré).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés d'exemple (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes de la feuille sont ceux de l'appli.
import { type ColorName, palettes } from '@ruche/brand'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { ImageSource } from '../ui/image'
import { ShareSheetPanel } from '../ui/ShareSheet'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useLayout } from '../ui/theme/layout'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Partager',
  intro:
    'La feuille qui s’ouvre par le bouton Partager d’un projet ou d’un membre : la vignette, « … sur Waiggle », l’adresse telle qu’elle sera copiée (rien d’autre), le bandeau qui dit qui pourra l’ouvrir, puis « Copier le lien » et « Partager… » (le menu de l’appareil, seulement s’il existe). « Copier le lien » ferme la feuille, puis le toast dit « Lien copié ».',
  project: 'Projet public, avec « Partager… »',
  noSystem: 'Projet public, sans menu de l’appareil (Firefox sur ordinateur)',
  private: 'Projet privé',
  member: 'Page d’un membre, sans photo',
  failed: 'Copie refusée : touche « Copier le lien » pour voir le message',
  desktop: 'Ordinateur : panneau centré',
  day: 'jour',
  night: 'nuit',
  projectTitle: 'Décollage !',
  memberName: 'Inès Haddad',
  close: 'Fermer',
}

const en: typeof fr = {
  title: 'Share',
  intro:
    'The sheet opened by the Share button of a project or a member: the thumbnail, “… on Waiggle”, the address as it will be copied (nothing else), the banner that says who will be able to open it, then “Copy link” and “Share…” (the device menu, only when it exists). “Copy link” closes the sheet, then the toast says “Link copied”.',
  project: 'Public project, with “Share…”',
  noSystem: 'Public project, without a device menu (Firefox on a computer)',
  private: 'Private project',
  member: 'Page of a member, without a photo',
  failed: 'Copy refused: tap “Copy link” to see the message',
  desktop: 'Computer: centred panel',
  day: 'day',
  night: 'night',
  projectTitle: 'Liftoff!',
  memberName: 'Inès Haddad',
  close: 'Close',
}

type Labels = typeof fr
const noop = () => {}
const refuse = () => Promise.resolve(false)
const schemes = ['day', 'night'] as const

/** Des identifiants valides (la feuille refuse de fabriquer une adresse sans eux). */
const PROJECT = '00000000-0000-4000-8000-0000000000f1'
const MEMBER = 'ines'

/**
 * La vignette d'exemple (le dépôt n'a pas de photo) : un dégradé SVG entre deux couleurs de la
 * marque, palette de jour (une photo ne change pas avec le thème), jamais écrites à la main.
 */
const sample = (from: ColorName, to: ColorName): ImageSource => {
  const day = palettes.day
  return {
    uri: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day.text}"/><stop offset="1" stop-color="${day[to]}"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><rect x="54" y="20" width="12" height="80" rx="6" fill="${day[from]}"/></svg>`,
    )}`,
  }
}
const photo = sample('surface', 'amber')

/** Un exemple légendé, à la largeur d'un téléphone. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <View style={{ width: 390, maxWidth: '100%' }}>
      <Stack gap="xs">
        {children}
        <Text variant="micro" tone="muted">
          {caption}
        </Text>
      </Stack>
    </View>
  )
}

/** Les cinq feuilles d'un thème, sur téléphone. */
function PhoneSheets({ l, scheme }: { l: Labels; scheme: (typeof schemes)[number] }) {
  const project = { kind: 'project' as const, id: PROJECT }
  return (
    <ThemeProvider appearance={scheme}>
      <Stack gap="lg">
        <Example caption={`${l.project} — ${l[scheme]}`}>
          <ShareSheetPanel
            layout="phone"
            title={l.projectTitle}
            target={project}
            image={photo}
            canShare
            closeLabel={l.close}
            onClose={noop}
          />
        </Example>
        <Example caption={`${l.noSystem} — ${l[scheme]}`}>
          <ShareSheetPanel
            layout="phone"
            title={l.projectTitle}
            target={project}
            image={photo}
            canShare={false}
            closeLabel={l.close}
            onClose={noop}
          />
        </Example>
        <Example caption={`${l.private} — ${l[scheme]}`}>
          <ShareSheetPanel
            layout="phone"
            title={l.projectTitle}
            target={project}
            visibility="private"
            image={photo}
            canShare
            closeLabel={l.close}
            onClose={noop}
          />
        </Example>
        <Example caption={`${l.member} — ${l[scheme]}`}>
          <ShareSheetPanel
            layout="phone"
            title={l.memberName}
            target={{ kind: 'member', id: MEMBER }}
            canShare
            closeLabel={l.close}
            onClose={noop}
          />
        </Example>
        <Example caption={`${l.failed} — ${l[scheme]}`}>
          <ShareSheetPanel
            layout="phone"
            title={l.projectTitle}
            target={project}
            image={photo}
            canShare={false}
            copy={refuse}
            closeLabel={l.close}
            onClose={noop}
          />
        </Example>
      </Stack>
    </ThemeProvider>
  )
}

export function ShareCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  // Jour et nuit côte à côte sur un écran large ; l'un sous l'autre ailleurs.
  const wide = useLayout().sizeClass === 'wide'
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Stack direction={wide ? 'row' : 'column'} gap="lg" wrap={wide}>
        {schemes.map((scheme) => (
          <PhoneSheets key={scheme} l={l} scheme={scheme} />
        ))}
      </Stack>
      {wide ? (
        <Stack gap="xs">
          <ShareSheetPanel
            layout="desktop"
            title={l.projectTitle}
            target={{ kind: 'project', id: PROJECT }}
            image={photo}
            canShare
            closeLabel={l.close}
            onClose={noop}
          />
          <Text variant="micro" tone="muted">
            {l.desktop}
          </Text>
        </Stack>
      ) : null}
    </Stack>
  )
}
