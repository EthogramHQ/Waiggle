// Page où arrive le membre après avoir cliqué sur le lien de l'e-mail : l'API a vérifié
// l'adresse, puis l'a redirigé ici (callbackURL).
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { setPendingEmail } from '../accounts/pendingVerification'
import { Button } from '../ui/Button'
import { useHoneyWave, type WaveButton } from '../ui/HoneyWaveHost'
import { Emblem } from '../ui/Illustrations'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

export function VerifiedScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  // Le bouton « Continuer » : la vague de miel part de son centre (R17).
  const button = useRef<WaveButton>(null)
  const wave = useHoneyWave()

  // L'adresse est vérifiée : celle qui attendait dans l'onglet (pour « Vérifie ta boîte mail »)
  // n'a plus de raison d'y rester ; sur un PC partagé, la personne suivante la lirait
  // (relecture de sécurité C1). useEffect : une fois la page affichée, dans le navigateur.
  useEffect(() => {
    setPendingEmail(null)
  }, [])

  return (
    <Screen
      // Sur le fond crème, comme les autres pages du compte (décision de Louis du 9/11/2026, R6b).
      pageTitle={t(($) => $.auth.verified.title)}
    >
      <Stack align="center">
        <Emblem icon="check" />
      </Stack>
      <Text variant="title2" align="center" heading={1}>
        {t(($) => $.auth.verified.title)}
      </Text>
      <Text tone="secondary" align="center">
        {t(($) => $.auth.verified.body)}
      </Text>
      {/* « Continuer » mène au Fil (`/feed`, plan R12, décision 9) : l'adresse vérifiée, le membre
          entre dans l'appli, pas sur l'accueil des visiteurs. R17 : par la vague de miel, qui
          monte depuis le bouton ; la page change quand elle couvre l'écran (`then`). */}
      <Button
        ref={button}
        label={t(($) => $.auth.verified.continue)}
        onPress={() => {
          // `then` en raccourci : Biome refuse une propriété nommée `then` écrite en clair.
          const then = () => router.replace('/feed')
          wave.play({ from: button.current, then })
        }}
      />
    </Screen>
  )
}
