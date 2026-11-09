// La section « Administration du catalogue : les gestes » du catalogue (corrections d'après les
// relectures de R6b) :
// - PendingToolCard pendant « Laisser hors du catalogue » (U1, des-B1) : le bouton touché tourne
//   tant que l'écriture est en route ; puis une panne, lue dans la carte au-dessus de ses boutons,
//   qui restent pour réessayer. Le premier exemple se manipule : « Laisser hors » tourne une seconde
//   et demie, puis échoue ; un second appui réussit ;
// - DiscardDialog (U3, ui-C1) : « Abandonner les changements ? » des feuilles d'administration
//   (outil, rattachement, rangement, catégorie). Une fenêtre couvre tout l'écran : elle s'ouvre par
//   un bouton.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses légendes (un outil de développement, absent de l'appli publiée)
// sont écrites ici en français et en anglais ; les textes des composants viennent de l'appli. Les
// noms et titres sont des contenus de membres : ils ne se traduisent pas.
import type { PendingTool } from '@ruche/contracts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { DiscardDialog } from '../ui/DiscardDialog'
import { PendingToolCard, type PendingToolOutcome } from '../ui/PendingToolCard'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Administration du catalogue : les gestes',
  cardIntro:
    'PendingToolCard pendant « Laisser hors du catalogue » : le bouton touché tourne jusqu’à la réponse ; une panne se lit dans la carte, au-dessus des boutons, qui restent. À manipuler : le premier essai échoue après 1,5 s, le second réussit.',
  busy: 'En route vers le serveur',
  failed: 'Après une panne',
  live: 'À manipuler',
  dialogIntro:
    'DiscardDialog : « Abandonner les changements ? » d’une feuille d’administration où l’on a écrit. Le focus arrive sur « Continuer » ; les boutons ignorent les tapes juste après l’ouverture.',
  open: 'Ouvrir la fenêtre',
  kept: 'Gardé : la feuille reste ouverte.',
  discarded: 'Abandonné : la feuille se ferme.',
}

const en: typeof fr = {
  title: 'Catalogue administration: the gestures',
  cardIntro:
    'PendingToolCard during “Leave out of the catalogue”: the pressed button spins until the answer; a failure reads inside the card, above the buttons, which stay. Try it: the first attempt fails after 1.5 s, the second one succeeds.',
  busy: 'On its way to the server',
  failed: 'After a failure',
  live: 'Try it',
  dialogIntro:
    'DiscardDialog: “Discard the changes?” of an administration sheet where something was written. Focus lands on “Keep editing”; the buttons ignore taps right after opening.',
  open: 'Open the window',
  kept: 'Kept: the sheet stays open.',
  discarded: 'Discarded: the sheet closes.',
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const makeCom: PendingTool = {
  slug: 'make-com',
  name: 'Make.com',
  createdAt: '2026-11-08T09:15:00.000Z',
  projectCount: 2,
  projects: [
    { id: id(81), title: 'Le tri des factures', author: { name: 'Hugo Lefèvre', handle: 'hugo' } },
    {
      id: id(82),
      title: 'Mes rappels de plantes',
      author: { name: 'Inès Moreau', handle: 'ines' },
    },
  ],
}

const noop = () => {}
const handlers = { onAdmit: noop, onMerge: noop, onDismiss: noop, onOpenProject: noop }

/** Le délai simulé de l'écriture, assez long pour voir le bouton tourner. */
const WRITE_MS = 1500

/** « Laisser hors » pour de vrai : une panne au premier essai, une réussite au second. */
function LiveDismiss() {
  const { t } = useTranslation()
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<PendingToolOutcome>(null)
  const tries = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return (
    <PendingToolCard
      tool={makeCom}
      outcome={outcome}
      {...handlers}
      dismissing={dismissing}
      error={error}
      onDismiss={() => {
        if (dismissing) return
        setDismissing(true)
        timer.current = setTimeout(() => {
          setDismissing(false)
          tries.current += 1
          // La panne reste jusqu'à la réponse de l'essai suivant, comme dans l'écran.
          if (tries.current === 1) setError(t(($) => $.errors.internal))
          else {
            setError(null)
            setOutcome({ kind: 'dismissed' })
          }
        }, WRITE_MS)
      }}
    />
  )
}

/** La fenêtre, ouverte par un bouton, et ce que chaque geste a donné. */
function DiscardDemo({ l }: { l: typeof fr }) {
  const [open, setOpen] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  return (
    <Stack gap="sm">
      <Button label={l.open} variant="secondary" onPress={() => setOpen(true)} />
      {said ? <Text tone="secondary">{said}</Text> : null}
      <DiscardDialog
        visible={open}
        onKeep={() => {
          setOpen(false)
          setSaid(l.kept)
        }}
        onDiscard={() => {
          setOpen(false)
          setSaid(l.discarded)
        }}
      />
    </Stack>
  )
}

export function AdminGesturesCatalogue() {
  const { t, i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.cardIntro}</Text>
      <Text variant="caption" tone="muted">
        {l.live}
      </Text>
      <LiveDismiss />
      <Text variant="caption" tone="muted">
        {l.busy}
      </Text>
      <PendingToolCard tool={makeCom} outcome={null} {...handlers} dismissing />
      <Text variant="caption" tone="muted">
        {l.failed}
      </Text>
      <PendingToolCard
        tool={makeCom}
        outcome={null}
        {...handlers}
        error={t(($) => $.errors.internal)}
      />
      <Text tone="secondary">{l.dialogIntro}</Text>
      <DiscardDemo l={l} />
    </Stack>
  )
}
