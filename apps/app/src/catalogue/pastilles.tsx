// La section « Ruches : les pastilles du Fil » du catalogue (tranche R10, F-Fil13) : le sélecteur
// de ruches (HivePills) dans tous ses états. « Tout » choisi, une ruche choisie, une ruche dont le
// nom a été retiré (« Ruche sans nom »), un nom long, et huit ruches dans une bande de téléphone
// (320 points) où la pastille choisie, la dernière, est amenée entièrement en vue. Jour et nuit ;
// le premier exemple se manipule (toucher, ou au clavier : Tab puis les flèches).
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés (un outil de développement, absent de l'appli publiée)
// sont écrits ici, en français et en anglais ; les textes du composant viennent de l'appli.
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ALL_HIVES, type HivePill, HivePills } from '../ui/HivePills'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Ruches : les pastilles du Fil',
  intro:
    'HivePills : « Tout » d’abord (les abonnements), puis une pastille par ruche. Des onglets (bâtis sur Tabs) : la liste se nomme « Ruches du fil », chaque pastille dit si elle est choisie et commande le Fil, dessiné par l’écran. Un seul arrêt de Tab, les flèches passent à la ruche voisine. Une seule ligne, qui défile de côté et montre toujours la pastille choisie en entier.',
  live: 'À manipuler : choisir une ruche, puis « Tout » (au clavier : Tab, puis les flèches)',
  all: '« Tout » choisi',
  hive: 'Une ruche choisie',
  unnamed: 'Une ruche dont le nom a été retiré : « Ruche sans nom »',
  long: 'Un nom long (40 caractères)',
  many: 'Huit ruches dans une bande de téléphone (320 points ici) : la pastille choisie, la dernière, se montre en entier',
  waiting:
    'Pendant la lecture des ruches (waiting) : le vrai « Tout », choisi, puis les pastilles vides des ruches à venir, dans la même capsule',
  hives: ['Famille', 'Amis du jeudi', 'Atelier IA', 'Voisins', 'Club photo', 'Cousins', 'Bureau'],
  last: 'Randonnée',
  longName: 'Les cousins de Bretagne et de Normandie',
  day: 'jour',
  night: 'nuit',
}

const en: typeof fr = {
  title: 'Hives: the Feed pills',
  intro:
    'HivePills: “All” first (who you follow), then one pill per hive. Tabs (built on Tabs): the list is named “Feed hives”, each pill tells whether it is chosen and controls the Feed, drawn by the screen. A single Tab stop, the arrows move to the next hive. A single line, which scrolls sideways and always shows the chosen pill in full.',
  live: 'Try it: choose a hive, then “All” (with the keyboard: Tab, then the arrows)',
  all: '“All” chosen',
  hive: 'A hive chosen',
  unnamed: 'A hive whose name was removed: “Unnamed hive”',
  long: 'A long name (40 characters)',
  many: 'Eight hives in a phone strip (320 points here): the chosen pill, the last one, shows in full',
  waiting:
    'While the hives load (waiting): the real “All”, chosen, then the empty pills of the hives to come, in the same capsule',
  hives: [
    'Family',
    'Thursday friends',
    'AI workshop',
    'Neighbours',
    'Photo club',
    'Cousins',
    'Office',
  ],
  last: 'Hiking',
  longName: 'The cousins from Brittany and Normandy',
  day: 'day',
  night: 'night',
}

/** Des identifiants de ruche fixes (le catalogue est pré-rendu : rien d'aléatoire). */
const idOf = (index: number) => `catalogue-hive-${index}`

/** Le panneau commandé : ici, aucun Fil n'est dessiné, l'identifiant suffit à l'exemple. */
const PANEL = 'catalogue-feed-panel'

const noop = () => {}

/** La rangée à manipuler : son choix gardé, comme dans le Fil. */
function LiveHivePills({ hives }: { hives: HivePill[] }) {
  const [value, setValue] = useState(ALL_HIVES)
  return <HivePills hives={hives} value={value} onChange={setValue} panelId={PANEL} />
}

export function HivePillsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const schemes = ['day', 'night'] as const
  const two: HivePill[] = [
    { id: idOf(0), name: l.hives[0] ?? '' },
    { id: idOf(1), name: l.hives[1] ?? '' },
  ]
  const eight: HivePill[] = [
    ...l.hives.map((name, index) => ({ id: idOf(index), name })),
    { id: idOf(7), name: l.last },
  ]
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Example caption={l.live}>
        <LiveHivePills hives={two} />
      </Example>

      {schemes.map((scheme) => (
        <ThemeProvider key={scheme} appearance={scheme}>
          <Stack gap="md">
            <Example caption={`${l.all} — ${l[scheme]}`}>
              <HivePills hives={two} value={ALL_HIVES} onChange={noop} panelId={PANEL} />
            </Example>
            <Example caption={`${l.waiting} — ${l[scheme]}`}>
              <HivePills hives={[]} value={ALL_HIVES} onChange={noop} panelId={PANEL} waiting />
            </Example>
            <Example caption={`${l.hive} — ${l[scheme]}`}>
              <HivePills hives={two} value={idOf(0)} onChange={noop} panelId={PANEL} />
            </Example>
            <Example caption={`${l.unnamed} — ${l[scheme]}`}>
              <HivePills
                hives={[...two, { id: idOf(2), name: null }]}
                value={idOf(2)}
                onChange={noop}
                panelId={PANEL}
              />
            </Example>
            <Example caption={`${l.long} — ${l[scheme]}`}>
              <Frame width={390}>
                <HivePills
                  hives={[two[0] ?? { id: idOf(0), name: null }, { id: idOf(3), name: l.longName }]}
                  value={idOf(3)}
                  onChange={noop}
                  panelId={PANEL}
                />
              </Frame>
            </Example>
            <Example caption={`${l.many} — ${l[scheme]}`}>
              <Frame width={320}>
                <HivePills hives={eight} value={idOf(7)} onChange={noop} panelId={PANEL} />
              </Frame>
            </Example>
          </Stack>
        </ThemeProvider>
      ))}
    </Stack>
  )
}

/** Un cadre de la largeur donnée (un téléphone), sans dépasser la colonne. */
function Frame({ width, children }: { width: number; children: ReactNode }) {
  return <View style={{ width, maxWidth: '100%' }}>{children}</View>
}

/** Un exemple et sa légende, sur le fond de la page de son thème. */
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
