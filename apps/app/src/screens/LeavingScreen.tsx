// Page d'avertissement « Tu quittes Waiggle » : tout lien vers un autre site (démo d'un projet, lien
// dans une description) passe par ici avant de s'ouvrir.
// Pourquoi ? Un lien peut mentir sur sa destination : le texte « le site officiel » peut mener
// ailleurs. Ici, le membre voit l'adresse réelle, et le nom du site en clair, avant de décider.
import { publicHttpsUrl } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { PortalRings } from '../ui/Illustrations'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'

/**
 * L'adresse si c'est un lien https vers un site public, sinon null. Même règle que pour le lien de
 * démo (voir publicHttpsUrl dans @ruche/contracts) : pas de javascript:, pas d'adresse IP ni de
 * machine du réseau local, pas d'identifiant caché avant « @ », pas de nom écrit dans un autre
 * alphabet qui pourrait imiter un site connu.
 */
const safeTarget = (value: string | undefined): { host: string; href: string } | null => {
  if (!value) return null
  // Aucun « mailto: », même vers notre adresse : ces textes parlent d'un site tiers. « Nous
  // écrire » (Mon compte) ouvre la messagerie directement, sans passer par ici.
  return publicHttpsUrl(value)
}

export function LeavingScreen({ url }: { url: string | undefined }) {
  const { t } = useTranslation()
  // Sans page précédente (lien ouvert dans un nouvel onglet), « Revenir » mène à l'accueil.
  const back = useGoBack('/')
  const target = safeTarget(url)
  // Sur le web, la page est préparée sans connaître l'adresse (elle est dans l'URL du visiteur) :
  // on n'affiche la destination qu'une fois dans le navigateur (voir ui/theme/hydration.ts).
  const hydrated = useHydrated()

  if (!hydrated) return <Screen title={t(($) => $.leaving.title)}>{null}</Screen>
  if (!target) {
    return (
      <Screen title={t(($) => $.leaving.title)}>
        <Notice message={t(($) => $.leaving.invalid)} />
        <Button label={t(($) => $.leaving.back)} variant="secondary" onPress={back} />
      </Screen>
    )
  }

  return (
    <Screen pageTitle={t(($) => $.leaving.title)}>
      {/* La porte vers l'extérieur : des anneaux de lumière autour d'une flèche. */}
      <PortalRings />
      {/* align="stretch" : les textes prennent toute la largeur, et un nom de site très long se
          coupe au lieu de sortir de l'écran. */}
      <Stack gap="xs" align="stretch">
        <Text variant="callout" weight={600} tone="secondary" align="center" heading={1}>
          {t(($) => $.leaving.title)}
        </Text>
        {/* Le nom du site, en grand : c'est lui qu'on doit reconnaître (ou pas). */}
        <Text variant="title2" align="center" breakAnywhere>
          {target.host}
        </Text>
      </Stack>
      <Stack gap="sm">
        <Text variant="caption" weight={600} tone="muted">
          {t(($) => $.leaving.destination)}
        </Text>
        {/* L'adresse complète, telle qu'elle sera ouverte : un nom de site écrit avec des lettres d'un
            autre alphabet y apparaît sous sa forme réelle (« xn--… »), ou il a été refusé plus haut. */}
        <Surface variant="grouped" padding="lg">
          <Text selectable breakAnywhere>
            {target.href}
          </Text>
        </Surface>
      </Stack>
      <Surface variant="grouped" padding="lg">
        <Row gap="md" align="start">
          <Icon name="key" size={22} tone="amber" />
          <Stack gap="xs" grow>
            <Text weight={700}>{t(($) => $.leaving.safety)}</Text>
            <Text variant="callout" tone="secondary">
              {t(($) => $.leaving.body)}
            </Text>
          </Stack>
        </Row>
      </Surface>
      <Button
        label={t(($) => $.leaving.continue, { host: target.host })}
        icon="arrow-up-right"
        onPress={() => void Linking.openURL(target.href)}
      />
      <Button label={t(($) => $.leaving.back)} variant="secondary" onPress={back} />
    </Screen>
  )
}
