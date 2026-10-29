// La section « Fin du fil » du catalogue (tranche R1) : le bas d'un fil (FeedEnd) dans tous ses
// états, et surtout « Tu es à jour », le bout du fil de l'accueil, posé sur une ambiance locale de
// miel vif, de jour et de nuit. À côté, la fin discrète des autres listes (« C'est tout »).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FeedEnd } from '../ui/FeedEnd'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Fin du fil',
  intro:
    'Le bas d’un fil : « Afficher la suite » tant qu’il en reste, puis la fin. Au bout du fil de l’accueil, « Tu es à jour » est un petit moment de marque, sur le miel vif ; le texte y est posé sur un verre, lisible de jour comme de nuit. Les autres listes finissent par une ligne discrète.',
  brand: 'Tu es à jour (le fil de l’accueil)',
  light: 'Fin discrète (commentaires, notifications, modération)',
  more: 'Il en reste',
  loading: 'La suite arrive',
  error: 'La suite n’a pas pu se charger',
  day: 'jour',
  night: 'nuit',
  showMore: 'Afficher la suite',
  upToDate: 'Tu es à jour',
  thatsAll: 'C’est tout',
  moreError: 'La suite n’a pas pu se charger.',
  retry: 'Réessayer',
}

const en: typeof fr = {
  title: 'End of the feed',
  intro:
    'The bottom of a feed: “Show more” while there is more, then the end. At the bottom of the home feed, “You’re all caught up” is a small brand moment, on bright honey; its text sits on glass, readable by day and by night. The other lists end with a quiet line.',
  brand: 'You’re all caught up (the home feed)',
  light: 'Quiet end (comments, notifications, moderation)',
  more: 'More to come',
  loading: 'More is on its way',
  error: 'More could not load',
  day: 'day',
  night: 'night',
  showMore: 'Show more',
  upToDate: 'You’re all caught up',
  thatsAll: 'That’s all',
  moreError: 'More could not load.',
  retry: 'Try again',
}

const noop = () => {}

export function FeedEndCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {schemes.map((scheme) => (
        // Un thème imposé autour de l'exemple : le jour et la nuit l'un sous l'autre, quel que soit
        // le thème du catalogue (ce ThemeProvider-là ne touche pas à la page).
        <ThemeProvider key={scheme} appearance={scheme}>
          <Example caption={`${l.brand} — ${l[scheme]}`}>
            <FeedEnd
              state="end"
              ambiance="brand"
              moreLabel={l.showMore}
              endLabel={l.upToDate}
              onMore={noop}
            />
          </Example>
        </ThemeProvider>
      ))}

      <Example caption={l.light}>
        <FeedEnd state="end" moreLabel={l.showMore} endLabel={l.thatsAll} onMore={noop} />
      </Example>
      <Example caption={l.more}>
        <FeedEnd state="more" moreLabel={l.showMore} endLabel={l.upToDate} onMore={noop} />
      </Example>
      <Example caption={l.loading}>
        <FeedEnd state="loading" moreLabel={l.showMore} endLabel={l.upToDate} onMore={noop} />
      </Example>
      <Example caption={l.error}>
        <FeedEnd
          state="error"
          moreLabel={l.showMore}
          endLabel={l.upToDate}
          errorLabel={l.moreError}
          retryLabel={l.retry}
          onMore={noop}
        />
      </Example>
    </Stack>
  )
}

/**
 * Un exemple et sa légende, sur le fond de la page de son thème (une feuille pleine) : l'exemple de
 * nuit se voit sur du noir même dans un catalogue de jour.
 */
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
