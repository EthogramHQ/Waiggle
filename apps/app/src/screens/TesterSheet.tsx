// La feuille « Rejoindre les testeurs » (R7a), ouverte depuis la page d'un projet
// (projects/ProjectActions) : elle dit ce que l'inscription veut dire (« Tu aides Léa à améliorer… » :
// l'auteur verra ton nom, ta photo et ta date d'inscription, un badge « Testeur » dans les
// commentaires, des retours qu'aucun autre membre ne lit ; juridique J4, R7b), avec « Rejoindre les
// testeurs » et « Annuler ».
// R7b : la feuille « Tu testes ce projet », d'où l'on partait, a disparu. Une fois inscrit, le bouton
// de la page mène au coin des testeurs ; on quitte depuis le coin, ou depuis le menu « … » de la page
// (juridique J1).
// Un refus de l'API se dit dans la feuille, juste au-dessus des boutons (le message du pied de
// `Sheet`) : « Ce projet ne prend plus de nouveaux testeurs. », jamais un nombre (juridique, T3).
//
// La feuille s'ouvre sous le doigt du bouton de la page : la seconde tape d'une double tape tombait
// sur sa confirmation (relecture de l'interface du plan R7a, B3). `guardTaps` fait ignorer aux
// boutons du pied toute tape pendant la garde d'ouverture (600 ms, comme les fenêtres).
//
// Deux exports : `TesterSheet`, la feuille posée sur la page, et `useTesterPanel`, son contenu seul
// (titre, texte, boutons, message), que le catalogue montre ouvert dans la page par `SheetPanel`.
// Ce fichier n'écrit aucun style : il assemble des composants de `src/ui`.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import type { TesterFailure } from '../testers/api'
import { Button } from '../ui/Button'
import { ButtonPair } from '../ui/ButtonPair'
import type { NoticeAction } from '../ui/Notice'
import { Sheet, type SheetPanel } from '../ui/Sheet'
import { Text } from '../ui/Text'

/**
 * Pourquoi la dernière demande a échoué : une raison de l'API (`TesterFailure`), ou `failed`, une
 * panne qu'un nouvel essai peut régler (réseau, serveur).
 */
export type TesterProblem = TesterFailure | 'failed'

export type TesterPanelProps = {
  /** Le nom affiché de l'auteur (« Tu aides Léa à améliorer… »). */
  authorName: string
  /** Le titre du projet, tel que l'auteur l'a écrit. */
  title: string
  /** La demande est partie : le bouton montre son chargement, la feuille ne se ferme plus. */
  pending: boolean
  /** Le refus de la dernière demande, ou rien. */
  problem: TesterProblem | null
  /** Un lien sous le message (« Me reconnecter », session expirée). */
  problemAction?: NoticeAction | undefined
  /** « Rejoindre les testeurs ». */
  onConfirm: () => void
  /** « Annuler ». */
  onClose: () => void
}

/** Ce que `SheetPanel` reçoit, sauf la disposition, que la feuille (ou le catalogue) choisit. */
type PanelContent = Omit<ComponentProps<typeof SheetPanel>, 'layout'>

/**
 * Hook : le contenu de la feuille d'inscription (titre, texte, pied, message). Un hook parce qu'il
 * traduit ses textes (`useTranslation`) ; il ne lit ni n'écrit rien d'autre.
 */
export function useTesterPanel({
  authorName,
  title,
  pending,
  problem,
  problemAction,
  onConfirm,
  onClose,
}: TesterPanelProps): PanelContent {
  const { t } = useTranslation()

  // Le message d'un refus : complet, plus « Testable » (ou membre retiré par l'auteur : la même
  // phrase, vraie pour toutes les causes, juridique J6), ou une panne. Session expirée et trop de
  // demandes ont le texte commun de l'appli.
  const message = (() => {
    if (problem === null) return null
    if (problem === 'expired') return t(($) => $.states.expired)
    if (problem === 'limited') return t(($) => $.errors.rateLimited)
    if (problem === 'full') return t(($) => $.project.testers.full)
    if (problem === 'notTestable') return t(($) => $.project.testers.notTestable)
    return t(($) => $.project.testers.error)
  })()

  // Les deux boutons du pied, côte à côte quand ils tiennent, l'un sous l'autre sinon (ButtonPair) :
  // « Rejoindre les testeurs » d'abord, puis « Annuler », inactif pendant la demande (la feuille ne
  // se ferme pas pendant son action, sinon le focus se perdrait).
  const footer = (
    <ButtonPair>
      {/* Le miel, ici : c'est la seule action de la feuille (sur la page, « Tester la démo » l'est). */}
      <Button
        key="confirm"
        label={t(($) => $.project.testers.confirm)}
        icon="users-three"
        onPress={onConfirm}
        loading={pending}
      />
      <Button
        key="close"
        label={t(($) => $.project.testers.cancel)}
        variant="secondary"
        onPress={onClose}
        disabled={pending}
      />
    </ButtonPair>
  )

  return {
    title: t(($) => $.project.testers.joinTitle),
    // Une feuille courte : sur téléphone, la hauteur de son texte, collée en bas.
    compact: true,
    busy: pending,
    onClose,
    footer,
    notice: message ? { message, tone: 'error', action: problemAction } : null,
    children: <Text>{t(($) => $.project.testers.joinBody, { name: authorName, title })}</Text>,
  }
}

type Props = TesterPanelProps & {
  open: boolean
}

/** La feuille d'inscription aux testeurs, posée sur la page d'un projet. */
export function TesterSheet({ open, ...panel }: Props) {
  const content = useTesterPanel(panel)
  return <Sheet open={open} guardTaps {...content} />
}
