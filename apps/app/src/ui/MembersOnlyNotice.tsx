// À la place des commentaires d'un projet public, pour un visiteur sans compte (tranche R12,
// planches R12-Visiteur-Projet et R12-Visiteur-Projet-Desktop) : « Les commentaires sont réservés
// aux membres. » et « Créer un compte ».
//
// Ni leur nombre, ni un extrait (scénario R12, A14) : la phrase seule. « Créer un compte » n'ouvre
// pas l'inscription directement : la page ouvre la feuille « Compte requis » (`onCreateAccount`),
// qui dit ce qu'un compte permet et que l'appli s'ouvre sur invitation.
//
// Un vrai bouton, pas un lien dans la phrase comme sur la planche de téléphone : le lien souligné
// n'offrait qu'une cible de 115 × 19 points (rapport de la planche), sous les 44 points demandés.
// Ce n'est pas l'action de la page (« Tester la démo », en miel) : un bouton blanc.
import { layout, radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { Icon } from './Icon'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** « Créer un compte » : la page ouvre la feuille « Compte requis ». */
  onCreateAccount: () => void
}

/** Le rond de miel pâle derrière la bulle : la hauteur d'une zone à toucher. */
const DISC = layout.touchTarget

export function MembersOnlyNotice({ onCreateAccount }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {/* La bulle est un décor : la phrase dit tout. */}
        <View
          aria-hidden
          style={{
            width: DISC,
            height: DISC,
            borderRadius: radii.pill,
            backgroundColor: colors.honeySoft,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="chat-circle-dots" size={22} tone="accent" />
        </View>
        {/* flexShrink et minWidth 0 : à 200 % de texte, la phrase passe à la ligne au lieu de
            sortir du cadre (sur le web, une vue ne rétrécit pas d'elle-même). */}
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <Text>{t(($) => $.visitor.commentsMembersOnly)}</Text>
        </View>
      </View>
      <Button
        label={t(($) => $.visitor.signUp)}
        variant="secondary"
        size="compact"
        onPress={onCreateAccount}
      />
    </Surface>
  )
}
