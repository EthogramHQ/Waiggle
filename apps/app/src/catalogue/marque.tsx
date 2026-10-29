// La section « Marque » du catalogue (tranche R1) : le logo vectoriel (Logo) dans ses trois
// variantes et de 24 à 480 points, et le nom écrit comme un logo (Wordmark), le point du i en
// miel. Le jour et la nuit se voient en changeant l'apparence en haut du catalogue (les captures
// prennent les deux). Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs
// personnes y travaillent en même temps. Ses libellés (un outil de développement, absent de
// l'appli publiée) sont écrits ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView } from 'react-native'
import { Logo, type LogoVariant } from '../ui/Logo'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { Wordmark } from '../ui/Wordmark'

const fr = {
  title: 'Marque',
  intro:
    'Le logo vectoriel : l’abeille dont le vol écrit le « w ». Il suit l’apparence (encre de jour, crème de nuit). Louis le valide sur ces captures avant qu’il remplace l’ancien.',
  full: 'Le logo entier (full)',
  bee: 'L’abeille seule (bee), pour les petites tailles',
  tinted: 'D’une seule couleur (tinted)',
  large: 'En grand : 240 et 480 points de haut (glisser sur téléphone)',
  wordmark: 'Le nom (Wordmark), le point du i en miel',
  wordmarkSizes: 'small, large, huge',
  withLogo: 'Avec l’abeille devant (logo)',
  sizes: (n: number) => `${n} pt`,
}

const en: typeof fr = {
  title: 'Brand',
  intro:
    'The vector logo: the bee whose flight writes the “w”. It follows the appearance (ink by day, cream at night). Louis approves it on these screenshots before it replaces the old one.',
  full: 'The whole logo (full)',
  bee: 'The bee alone (bee), for small sizes',
  tinted: 'In a single colour (tinted)',
  large: 'Large: 240 and 480 points high (swipe on a phone)',
  wordmark: 'The name (Wordmark), the dot of the i in honey',
  wordmarkSizes: 'small, large, huge',
  withLogo: 'With the bee in front (logo)',
  sizes: (n: number) => `${n} pt`,
}

/** Une rangée du même logo à plusieurs hauteurs, chacune avec sa taille écrite dessous. */
function Sizes({
  variant,
  sizes,
  label,
}: {
  variant: LogoVariant
  sizes: number[]
  label: (n: number) => string
}) {
  return (
    <Stack direction="row" gap="lg" wrap align="end">
      {sizes.map((size) => (
        <Stack key={size} gap="xs" align="center">
          <Logo variant={variant} size={size} />
          <Text variant="micro" tone="muted">
            {label(size)}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface variant="grouped" padding="lg" gap="md">
      <Text variant="headline" tone="secondary">
        {title}
      </Text>
      {children}
    </Surface>
  )
}

export function BrandCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Block title={l.full}>
        <Sizes variant="full" sizes={[24, 32, 48, 96]} label={l.sizes} />
      </Block>
      <Block title={l.bee}>
        <Sizes variant="bee" sizes={[16, 24, 32, 48, 96]} label={l.sizes} />
      </Block>
      <Block title={l.tinted}>
        <Sizes variant="tinted" sizes={[24, 48, 96]} label={l.sizes} />
      </Block>
      <Block title={l.large}>
        {/* Plus large qu'un téléphone : on glisse de côté pour voir la suite. */}
        <ScrollView horizontal>
          <Stack direction="row" gap="xl" align="end">
            <Logo size={240} />
            <Logo variant="bee" size={240} />
          </Stack>
        </ScrollView>
        <ScrollView horizontal>
          <Logo size={480} />
        </ScrollView>
      </Block>
      <Block title={l.wordmark}>
        <Text variant="micro" tone="muted">
          {l.wordmarkSizes}
        </Text>
        <Wordmark size="small" />
        <Wordmark size="large" />
        <Wordmark size="huge" />
      </Block>
      <Block title={l.withLogo}>
        <Wordmark size="small" logo />
        <Wordmark size="large" logo />
        <Wordmark size="huge" logo />
      </Block>
    </Stack>
  )
}
