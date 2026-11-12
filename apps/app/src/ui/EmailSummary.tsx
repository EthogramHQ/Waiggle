// « Ce que tu reçois par e-mail » (tranche R8, planche R8-Activite-Desktop) : la colonne de droite de
// la page Activité sur ordinateur. Une carte dit en une phrase ce qui part par e-mail (« Les réponses
// et les mentions tout de suite ; le reste dans le récap du dimanche, à 10 h. », écrite par
// `email/summary.ts`) et mène aux réglages des notifications ; dessous, hors de la carte, une note
// rappelle qu'on ne voit nulle part qui a réagi ou qui suit, seulement des nombres.
//
// Le titre est de niveau 2 : celui de la page (« Activité ») reste le seul de niveau 1. Tant que les
// réglages ne sont pas lus (`summary: null`), la carte ne promet rien, mais le chemin vers eux reste :
// le membre peut toujours aller voir.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Button } from './Button'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** Le titre de la carte (« Ce que tu reçois par e-mail »). */
  title: string
  /** La phrase des réglages ; null : pas encore lus (ou illisibles), rien n'est promis. */
  summary: string | null
  /** La note sous la carte (« On ne voit nulle part qui a réagi… »). */
  note: string
  /** Le nom du bouton qui mène aux réglages (« Régler les notifications »). */
  actionLabel: string
  onAction: () => void
}

export function EmailSummary({ title, summary, note, actionLabel, onAction }: Props) {
  return (
    // Une colonne : la carte, puis la note. Les textes s'étirent sur toute la largeur (ils se
    // replient au lieu de déborder) ; le bouton garde sa largeur, rangé à gauche.
    <View style={{ gap: space.md }}>
      <Surface variant="grouped" padding="lg" gap="md">
        <Text heading={2} variant="headline">
          {title}
        </Text>
        {summary ? (
          <Text variant="callout" tone="secondary">
            {summary}
          </Text>
        ) : null}
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
          <Button
            label={actionLabel}
            icon="gear-six"
            variant="secondary"
            size="compact"
            onPress={onAction}
          />
        </View>
      </Surface>
      {/* La note, alignée sur le texte de la carte plutôt que sur son bord (planche). */}
      <View style={{ paddingHorizontal: space.xs }}>
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      </View>
    </View>
  )
}
