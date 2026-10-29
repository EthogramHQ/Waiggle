// La section « Chargement » du catalogue (tranche R1) : le logo animé du lancement (LoadingLogo),
// en boucle puis arrêté à chacune de ses phases, posé comme avec « Réduire les animations », et
// les squelettes qui remplacent « Chargement… » dans les pages (SkeletonCard, SkeletonList). Le
// jour et la nuit se voient en changeant l'apparence en haut du catalogue (les captures prennent
// les deux). Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs
// personnes y travaillent en même temps. Ses libellés (un outil de développement, absent de
// l'appli publiée) sont écrits ici, en français et en anglais.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingLogo, restMoment } from '../ui/LoadingLogo'
import { SkeletonCard, SkeletonList } from '../ui/Skeleton'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'

const fr = {
  title: 'Chargement',
  intro:
    'Au lancement de l’appli sur téléphone, l’abeille écrit le « w », se pose, puis repart (4,6 s en boucle). Dans les pages, des squelettes annoncent la forme du contenu qui arrive.',
  loop: 'Le logo animé (LoadingLogo), en boucle : 114 et 240 points de large',
  phases: 'Arrêté à chaque phase (prop moment)',
  moments: [
    { at: 0.03, label: '3 % : l’élan, en fondu' },
    { at: 0.25, label: '25 % : elle écrit le « w »' },
    { at: 0.45, label: '45 % : elle grandit et se redresse' },
    { at: restMoment, label: '66 % : posée, le logo' },
    { at: 0.8, label: '80 % : elle repart, la queue s’efface' },
    { at: 0.92, label: '92 % : tout s’estompe' },
  ],
  calm: 'Avec « Réduire les animations » : posé, immobile',
  card: 'Une carte qui charge (SkeletonCard)',
  list: 'Une liste qui charge (SkeletonList, 3 cartes, un seul nom lu)',
}

const en: typeof fr = {
  title: 'Loading',
  intro:
    'When the app starts on a phone, the bee writes the “w”, lands, then flies off again (a 4.6 s loop). In pages, skeletons show the shape of the content on its way.',
  loop: 'The animated logo (LoadingLogo), looping: 114 and 240 points wide',
  phases: 'Stopped at each phase (moment prop)',
  moments: [
    { at: 0.03, label: '3%: the run-up, fading in' },
    { at: 0.25, label: '25%: writing the “w”' },
    { at: 0.45, label: '45%: growing and straightening up' },
    { at: restMoment, label: '66%: landed, the logo' },
    { at: 0.8, label: '80%: flying off, the tail fading' },
    { at: 0.92, label: '92%: everything fades out' },
  ],
  calm: 'With “Reduce motion”: landed, still',
  card: 'A card loading (SkeletonCard)',
  list: 'A list loading (SkeletonList, 3 cards, a single spoken name)',
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

export function LoadingCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Block title={l.loop}>
        <Stack direction="row" gap="xl" wrap align="center">
          <LoadingLogo />
          <LoadingLogo width={240} />
        </Stack>
      </Block>
      <Block title={l.phases}>
        <Stack direction="row" gap="xl" wrap align="end">
          {/* paddingX : à 3 %, l'abeille arrive de la gauche, hors du cadre du logo ; cette marge
              la garde dans la carte (et garde les phases alignées entre elles). */}
          {l.moments.map((moment) => (
            <Stack key={moment.at} gap="sm" align="center" paddingX="xl">
              <LoadingLogo width={160} moment={moment.at} />
              <Text variant="micro" tone="muted">
                {moment.label}
              </Text>
            </Stack>
          ))}
        </Stack>
      </Block>
      <Block title={l.calm}>
        <LoadingLogo moment={restMoment} />
      </Block>
      <Block title={l.card}>
        <SkeletonCard />
      </Block>
      <Block title={l.list}>
        <SkeletonList count={3} />
      </Block>
    </Stack>
  )
}
