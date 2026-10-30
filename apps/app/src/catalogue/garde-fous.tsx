// Catalogue de deux composants des formulaires du compte (tranche R2, corrections après les
// relectures) : le bouton « à réessayer plus tard » (RetryButton) libre, bloqué avec son heure, et
// bloqué pour une autre raison ; l'encadré « à savoir avant le geste » (Callout). Fichier à part de
// CatalogueScreen.tsx, qui l'importe en une ligne. Les textes d'exemple sont écrits ici en clair :
// le catalogue est un outil de développement, absent de l'appli publiée.
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { HeldSpace } from '../ui/HeldSpace'
import { Notice } from '../ui/Notice'
import { RetryButton } from '../ui/RetryButton'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

// Une heure fixe, et non `Date.now()` : la page est pré-rendue, et une heure tirée au rendu
// différerait au navigateur (React #418, voir code-appli.md).
const until = new Date(2026, 9, 30, 21, 47)
const format = (time: string) => `Nouvel essai possible à ${time}`

/** HeldSpace en deux états, affiché puis vidé, d'un toucher (la hauteur se mesure à l'affichage). */
function HeldSpaceDemo() {
  const [vacated, setVacated] = useState(false)
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Stack gap="sm">
        <HeldSpace vacated={vacated}>
          <Notice message="Trop d’essais pour l’instant." />
        </HeldSpace>
        <Button
          label={vacated ? 'Remettre le message' : 'Effacer en gardant la place'}
          variant="secondary"
          onPress={() => setVacated(!vacated)}
        />
      </Stack>
    </View>
  )
}

export function SafeguardsCatalogue() {
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        Réessayer plus tard, à savoir avant (R2)
      </Text>
      <Text tone="secondary">
        RetryButton : libre ; bloqué par « trop d’essais » (la phrase dessous, que le bouton
        désigne) ; libre de l’attente mais inactif pour une autre raison (mot de passe pas encore
        tapé).
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Stack gap="sm">
          <RetryButton
            label="Envoyer le lien"
            onPress={() => {}}
            retry={{ blocked: false, until: null }}
          />
          <RetryButton
            label="Renvoyer le lien"
            variant="secondary"
            onPress={() => {}}
            retry={{ blocked: true, until }}
            format={format}
          />
          <RetryButton
            label="Changer le mot de passe"
            onPress={() => {}}
            retry={{ blocked: false, until: null }}
            disabled
          />
        </Stack>
      </View>
      <Text tone="secondary">
        HeldSpace : le message s’affiche ; « Effacer » le retire en gardant sa place (la fin d’une
        attente « trop d’essais ») : le bouton dessous ne bouge pas. « Remettre » le rend.
      </Text>
      <HeldSpaceDemo />
      <Text tone="secondary">Callout : ce qu’il faut savoir avant le geste.</Text>
      <Callout
        icon="device-mobile"
        title="Tes autres appareils seront déconnectés"
        body="Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe."
      />
    </Stack>
  )
}
