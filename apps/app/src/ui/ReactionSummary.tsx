// Les réactions d'un projet public vues par un visiteur sans compte (tranche R12, planches
// R12-Visiteur-Projet et R12-Visiteur-Projet-Desktop) : une carte blanche avec l'étincelle, le
// nombre (« 54 réactions de membres ») et, à droite, « Réagir ».
//
// Le nombre seul, jamais qui a réagi ni quelles réactions (scénario R12 ; relecture juridique : le
// détail laisserait deviner qui). « Réagir » ne réagit pas : un visiteur n'a pas de compte, la page
// ouvre la feuille « Compte requis » (`onReact`). Rien n'est fait à sa place.
//
// À texte agrandi ou sur un écran étroit, « Réagir » passe sous la phrase au lieu de l'écraser : la
// phrase prend la place qui reste (`flexGrow` et une vraie `flexBasis`), le bouton garde sa taille.
import { space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { Icon } from './Icon'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** Le nombre de réactions des membres, toutes sortes confondues (`reactionCount` du contrat). */
  count: number
  /** « Réagir » : la page ouvre la feuille « Compte requis ». */
  onReact: () => void
}

/** La place minimale de la phrase avant que « Réagir » passe à la ligne. */
const SENTENCE_BASIS = 160

export function ReactionSummary({ count, onReact }: Props) {
  const { t } = useTranslation()
  return (
    <Surface variant="grouped" padding="md">
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
          rowGap: space.sm,
          // Sur le web, une rangée ne rétrécit pas d'elle-même (320 points, texte à 200 %).
          maxWidth: '100%',
          flexShrink: 1,
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: SENTENCE_BASIS, flexShrink: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            {/* L'étincelle est un décor : la phrase dit tout. Une vue autour, pour que le dessin ne
                rétrécisse pas sur le web quand la phrase est longue. */}
            <View aria-hidden style={{ flexShrink: 0 }}>
              <Icon name="sparkle-fill" size={20} tone="honey" />
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text variant="callout" weight={600}>
                {t(($) => $.visitor.reactions, { count })}
              </Text>
            </View>
          </View>
        </View>
        <Button
          label={t(($) => $.visitor.react)}
          variant="secondary"
          size="small"
          onPress={onReact}
        />
      </View>
    </Surface>
  )
}
