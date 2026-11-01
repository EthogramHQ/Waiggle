// La section « Mascotte » du catalogue (tranche R1) : l'abeille dans ses quatre poses, à toutes ses
// tailles, sur la Cire (le fond de jour) et sur la Nuit, posée sur son disque de verre ; puis la
// petite abeille d'un toast, et ce que montre chaque état de StateMessage.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Mascot, type MascotPose, type MascotSize } from '../ui/Mascot'
import { Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { Toast } from '../ui/Toast'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Mascotte',
  intro:
    'L’abeille accompagne les états de l’appli : la loupe pour « introuvable », le sommeil pour « rien de nouveau », le salut pour « réservé aux membres », le vol pour « regarde ta boîte ». Seule, elle est une image nommée ; à côté d’un titre qui dit déjà tout, elle est décorative, cachée aux lecteurs d’écran.',
  poses: { fly: 'Vol', wave: 'Salut', sleep: 'Sommeil', search: 'Loupe' },
  sizes: 'Tailles : sm (96), md (144), lg (200)',
  day: 'sur la Cire',
  night: 'sur la Nuit',
  toast: 'Dans un toast (taille inline, petit disque plein, décorative)',
  toastText: 'Rien de nouveau pour l’instant',
  states: 'Dans StateMessage (décorative)',
  notFound: 'Page introuvable',
  empty: 'Pas encore de notification',
  signedOut: 'Réservé aux membres',
}

const en: typeof fr = {
  title: 'Mascot',
  intro:
    'The bee goes with the states of the app: the magnifier for “not found”, sleep for “nothing new”, a wave for “members only”, flight for “check your inbox”. On its own it is a named image; next to a title that already says it all, it is decorative, hidden from screen readers.',
  poses: { fly: 'Flight', wave: 'Wave', sleep: 'Sleep', search: 'Magnifier' },
  sizes: 'Sizes: sm (96), md (144), lg (200)',
  day: 'on Wax',
  night: 'on Night',
  toast: 'In a toast (inline size, small solid disc, decorative)',
  toastText: 'Nothing new for now',
  states: 'In StateMessage (decorative)',
  notFound: 'Page not found',
  empty: 'No notifications yet',
  signedOut: 'Members only',
}

const poses: MascotPose[] = ['fly', 'wave', 'sleep', 'search']
const sizes: MascotSize[] = ['sm', 'md', 'lg']

export function MascotCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {(['day', 'night'] as const).map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue.
        <ThemeProvider key={scheme} appearance={scheme}>
          <Example caption={l[scheme]}>
            <Stack direction="row" gap="lg" wrap align="end">
              {poses.map((pose) => (
                <Stack key={pose} gap="xs" align="center">
                  <Mascot pose={pose} size="sm" />
                  <Text variant="caption" tone="muted">
                    {l.poses[pose]}
                  </Text>
                </Stack>
              ))}
            </Stack>
          </Example>
        </ThemeProvider>
      ))}

      <Example caption={l.sizes}>
        <Stack direction="row" gap="lg" wrap align="end">
          {sizes.map((size) => (
            <Mascot key={size} pose="wave" size={size} />
          ))}
        </Stack>
      </Example>

      <Example caption={l.toast}>
        <Toast
          text={l.toastText}
          leading={<Mascot pose="sleep" size="inline" decorative />}
          leaving={false}
          calm
        />
      </Example>

      <Example caption={l.states}>
        <Stack gap="xl" align="stretch">
          <StateMessage kind="notFound" title={l.notFound} />
          <StateMessage kind="empty" title={l.empty} />
          <StateMessage kind="signedOut" title={l.signedOut} />
        </Stack>
      </Example>
    </Stack>
  )
}

/** Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine). */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Surface variant="plain" padding="lg" gap="sm">
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
      {children}
    </Surface>
  )
}
