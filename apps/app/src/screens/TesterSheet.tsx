// Les deux feuilles des testeurs (R7a), ouvertes depuis la page d'un projet (projects/ProjectActions) :
// - « Rejoindre les testeurs » dit ce que l'inscription veut dire (« Tu aides Léa à améliorer… »,
//   l'auteur verra ton nom), avec « Rejoindre les testeurs » et « Annuler » ;
// - « Tu testes ce projet » rappelle qu'on en fait partie, avec « Quitter les testeurs » et « Fermer ».
// Un refus de l'API se dit dans la feuille, juste au-dessus des boutons (le message du pied de
// `Sheet`) : « Ce projet ne prend plus de nouveaux testeurs. », jamais un nombre (juridique, T3).
//
// La feuille s'ouvre sous le doigt du bouton de la page : la seconde tape d'une double tape tombait
// sur « Quitter les testeurs » (relecture de l'interface du plan, B3). `guardTaps` fait ignorer aux
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

/** Quelle feuille : s'inscrire, ou celle de qui teste déjà (pour partir). */
export type TesterSheetMode = 'join' | 'member'

/**
 * Pourquoi la dernière demande a échoué : une raison de l'API (`TesterFailure`), ou `failed`, une
 * panne qu'un nouvel essai peut régler (réseau, serveur).
 */
export type TesterProblem = TesterFailure | 'failed'

export type TesterPanelProps = {
  mode: TesterSheetMode
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
  /** « Rejoindre les testeurs » ou « Quitter les testeurs », selon la feuille. */
  onConfirm: () => void
  /** « Annuler » ou « Fermer ». */
  onClose: () => void
}

/** Ce que `SheetPanel` reçoit, sauf la disposition, que la feuille (ou le catalogue) choisit. */
type PanelContent = Omit<ComponentProps<typeof SheetPanel>, 'layout'>

/**
 * Hook : le contenu d'une feuille des testeurs (titre, texte, pied, message). Un hook parce qu'il
 * traduit ses textes (`useTranslation`) ; il ne lit ni n'écrit rien d'autre.
 */
export function useTesterPanel({
  mode,
  authorName,
  title,
  pending,
  problem,
  problemAction,
  onConfirm,
  onClose,
}: TesterPanelProps): PanelContent {
  const { t } = useTranslation()
  const joining = mode === 'join'

  // Le message d'un refus. Rejoindre : complet, plus « Testable », ou une panne ; partir : seule la
  // panne a son texte (l'API ne refuse pas un départ pour une autre raison). Session expirée et trop
  // de demandes ont le texte commun de l'appli.
  const message = (() => {
    if (problem === null) return null
    if (problem === 'expired') return t(($) => $.states.expired)
    if (problem === 'limited') return t(($) => $.errors.rateLimited)
    if (!joining) return t(($) => $.project.testers.quitError)
    if (problem === 'full') return t(($) => $.project.testers.full)
    if (problem === 'notTestable') return t(($) => $.project.testers.notTestable)
    return t(($) => $.project.testers.error)
  })()

  // Les deux boutons du pied, côte à côte quand ils tiennent, l'un sous l'autre sinon (ButtonPair) :
  // le geste de la feuille d'abord, puis « Annuler » ou « Fermer », inactif pendant la demande (la
  // feuille ne se ferme pas pendant son action, sinon le focus se perdrait).
  const footer = (
    <ButtonPair>
      {joining ? (
        // Le miel, ici : c'est la seule action de la feuille (sur la page, « Tester la démo » l'est).
        <Button
          key="confirm"
          label={t(($) => $.project.testers.confirm)}
          icon="users-three"
          onPress={onConfirm}
          loading={pending}
        />
      ) : (
        // En blanc : partir n'efface rien, mais ce n'est pas le geste qu'on vient chercher.
        <Button
          key="confirm"
          label={t(($) => $.project.testers.quit)}
          icon="sign-out"
          variant="secondary"
          onPress={onConfirm}
          loading={pending}
        />
      )}
      <Button
        key="close"
        label={joining ? t(($) => $.project.testers.cancel) : t(($) => $.project.testers.close)}
        variant="secondary"
        onPress={onClose}
        disabled={pending}
      />
    </ButtonPair>
  )

  return {
    title: joining
      ? t(($) => $.project.testers.joinTitle)
      : t(($) => $.project.testers.memberTitle),
    // Une feuille courte : sur téléphone, la hauteur de son texte, collée en bas.
    compact: true,
    busy: pending,
    onClose,
    footer,
    notice: message ? { message, tone: 'error', action: problemAction } : null,
    children: (
      <Text>
        {joining
          ? t(($) => $.project.testers.joinBody, { name: authorName, title })
          : t(($) => $.project.testers.memberBody, { title })}
      </Text>
    ),
  }
}

type Props = TesterPanelProps & {
  open: boolean
}

/** La feuille des testeurs, posée sur la page d'un projet. */
export function TesterSheet({ open, ...panel }: Props) {
  const content = useTesterPanel(panel)
  return <Sheet open={open} guardTaps {...content} />
}
