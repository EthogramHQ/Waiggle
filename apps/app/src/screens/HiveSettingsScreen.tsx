// Les réglages d'une ruche, réservés à son animateur (R10, docs/scenarios/refonte.md, « L'animateur » ;
// planche R10-Reglages-Ruche ; page poussée `/hives/<id>/settings`, ouverte par « Réglages de la
// ruche » du menu « … » de la page de la ruche). On y trouve, de haut en bas :
// - l'alvéole de la ruche et « Changer l'icône », qui ouvre une feuille aux douze icônes
//   (`HiveIconPicker`) : chaque choix s'enregistre aussitôt ;
// - le nom, enregistré en quittant le champ ou par Entrée, sans bouton « Enregistrer » (option 1 des
//   planches) ; un nom vide ou trop long reste dans le champ avec son message, et rien ne part ;
// - « Qui peut inviter ? » (« Tous les membres » ou « Seulement moi »), enregistré au toucher ; après
//   des échecs, le choix revient à la valeur du serveur (le modèle des réglages d'e-mail de R8) ;
// - « Confier l'animation » : une feuille liste les autres membres, puis une fenêtre demande
//   confirmation ; ensuite la page de la ruche remplace les réglages (l'animateur n'y a plus droit) ;
// - « Supprimer la ruche », en rouge, et sa fenêtre (`hives/HiveDialogs`).
//
// Un membre qui n'anime pas la ruche (un lien gardé, l'animation confiée entre-temps) n'y entre pas :
// la page de la ruche prend la place des réglages. Une ruche qu'on ne voit pas : « introuvable ».
import {
  HIVE_NAME_MAX,
  type HiveIcon,
  type HiveInvitePolicy,
  type HiveMember,
  type HivePage,
} from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useHive, useHiveMembers, usePatchHive } from '../hives/api'
import { DeleteHiveDialog, HandOverDialog } from '../hives/HiveDialogs'
import { useSignInAgain } from '../navigation/signInAgain'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { Button } from '../ui/Button'
import { HiveBadge } from '../ui/HiveBadge'
import { HiveIconPicker } from '../ui/HiveIconPicker'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { SkeletonList } from '../ui/Skeleton'
import { Row, Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'
import {
  LoadErrorScreen,
  LoadingScreen,
  NotFoundState,
  SessionErrorScreen,
  SignedOutScreen,
} from './states'

export function HiveSettingsScreen({ id }: { id: string }) {
  const { state, session, retry } = useMemberSession()
  if (state === 'pending') return <LoadingScreen />
  if (state === 'error') return <SessionErrorScreen onRetry={retry} />
  if (!session) return <SignedOutScreen />
  // Les lectures ne partent qu'avec une session : elles vivent dans le composant suivant.
  return <Settings id={id} />
}

function Settings({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const hive = useHive(id)
  const page = hive.data
  // On part (animation confiée, ruche supprimée, ou pas animateur) : une seule navigation.
  const leaving = useRef(false)
  const notAnimator = page !== undefined && page.summary.role !== 'animator'

  // Un membre qui n'anime pas la ruche : la page de la ruche, à la place des réglages (sans entrée
  // d'historique : « Retour » ne ramène pas ici).
  useEffect(() => {
    if (!notAnimator || leaving.current) return
    leaving.current = true
    router.replace(`/hives/${id}`)
  }, [notAnimator, router, id])

  // La page d'abord : une relecture qui échoue (la ruche supprimée qui se relit en 404 pendant le
  // départ) ne remplace pas ce qui est affiché.
  if (page && !notAnimator) return <SettingsPage page={page} leaving={leaving} />
  if (page) return <LoadingScreen />
  if (hive.error) {
    const key = errorKey(hive.error)
    if (key === 'notFound') return <NotFoundState title={t(($) => $.states.notFoundTitle)} />
    if (key === 'unauthorized') return <SignedOutScreen expired />
    return <LoadErrorScreen error={hive.error} onRetry={() => void hive.refetch()} />
  }
  return <LoadingScreen />
}

/** Les refus qui ont leur propre phrase, plus juste que « Réessaie ». */
const ownMessage = (key: ApiErrorKey) =>
  key === 'rateLimited' || key === 'suspended' || key === 'forbidden' ? key : null

type PageProps = {
  page: HivePage
  /** Partagé avec l'écran : vrai dès qu'une navigation de départ est demandée. */
  leaving: { current: boolean }
}

function SettingsPage({ page, leaving }: PageProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const signInAgain = useSignInAgain()
  const id = page.summary.id
  const back = useGoBack(`/hives/${id}`)
  const patch = usePatchHive(id)
  const { mutateAsync } = patch

  // La phrase d'un refus : la sienne s'il en a une, sinon celle du réglage (« Réessaie »).
  const refusalText = (key: ApiErrorKey, fallback: string) => {
    const own = ownMessage(key)
    return own ? t(($) => $.errors[own]) : fallback
  }
  // Une session expirée : un seul message, en tête de page, avec « Me reconnecter ».
  const [expired, setExpired] = useState(false)
  const noteFailure = (key: ApiErrorKey) => {
    if (key === 'unauthorized') setExpired(true)
  }

  // --- Le nom -------------------------------------------------------------------------------------

  const [name, setName] = useState(page.summary.name ?? '')
  // Le nom que le serveur a confirmé, puis celui qui est parti : un second départ du champ (Entrée
  // puis la perte du focus) n'envoie pas deux fois la même chose.
  const confirmedName = useRef(page.summary.name ?? '')
  const sentName = useRef(confirmedName.current)
  type NameProblem = 'required' | 'tooLong' | { refused: ApiErrorKey }
  const [nameProblem, setNameProblem] = useState<NameProblem | null>(null)

  const saveName = () => {
    const wanted = name.trim()
    // Rien n'a changé : rien ne part, et un message d'avant (vide, trop long) n'a plus lieu d'être.
    if (wanted === confirmedName.current && name.length <= HIVE_NAME_MAX) {
      setNameProblem(null)
      return
    }
    // Vide ou trop long : le texte reste dans le champ, avec son message ; rien ne part.
    if (wanted === '') return setNameProblem('required')
    if (wanted.length > HIVE_NAME_MAX) return setNameProblem('tooLong')
    if (wanted === sentName.current) return
    sentName.current = wanted
    mutateAsync({ name: wanted }).then(
      () => {
        confirmedName.current = wanted
        setNameProblem(null)
      },
      (error: unknown) => {
        // Refusé : on pourra renvoyer le même nom (quitter le champ, Entrée).
        sentName.current = confirmedName.current
        const key = errorKey(error)
        noteFailure(key)
        setNameProblem({ refused: key })
      },
    )
  }

  const nameMessage =
    nameProblem === null
      ? undefined
      : nameProblem === 'required'
        ? t(($) => $.hives.createSheet.nameRequired)
        : nameProblem === 'tooLong'
          ? t(($) => $.hives.createSheet.nameHint)
          : nameProblem.refused === 'unauthorized'
            ? undefined
            : refusalText(
                nameProblem.refused,
                t(($) => $.hives.settings.nameError),
              )

  // --- L'icône ------------------------------------------------------------------------------------

  // Les flèches du clavier passent d'une icône à l'autre en les cochant : on n'envoie pas chacune.
  // Pendant un envoi, seul le dernier choix attend ; il part quand le précédent a répondu.
  const [iconOpen, setIconOpen] = useState(false)
  const [iconWanted, setIconWanted] = useState<HiveIcon | null>(null)
  const [iconConfirmed, setIconConfirmed] = useState<HiveIcon>(page.summary.icon)
  const confirmedIcon = useRef(page.summary.icon)
  const nextIcon = useRef<HiveIcon | null>(null)
  const sendingIcon = useRef(false)
  const [iconFailure, setIconFailure] = useState<ApiErrorKey | null>(null)
  const shownIcon = iconWanted ?? iconConfirmed

  const sendIcons = async () => {
    sendingIcon.current = true
    while (nextIcon.current !== null && nextIcon.current !== confirmedIcon.current) {
      const icon = nextIcon.current
      nextIcon.current = null
      try {
        await mutateAsync({ icon })
        confirmedIcon.current = icon
        setIconConfirmed(icon)
        setIconFailure(null)
      } catch (error) {
        const key = errorKey(error)
        noteFailure(key)
        setIconFailure(key)
      }
    }
    nextIcon.current = null
    sendingIcon.current = false
    // Plus rien en route : l'alvéole montre ce que le serveur a gardé.
    setIconWanted(null)
  }

  const chooseIcon = (icon: HiveIcon) => {
    if (icon === shownIcon) return
    setIconWanted(icon)
    nextIcon.current = icon
    if (!sendingIcon.current) void sendIcons()
  }

  const iconMessage =
    iconFailure && iconFailure !== 'unauthorized'
      ? refusalText(
          iconFailure,
          t(($) => $.hives.settings.iconError),
        )
      : null

  // --- Qui peut inviter ---------------------------------------------------------------------------

  // Le choix change au toucher. Chaque toucher part (les écritures d'une ruche passent l'une après
  // l'autre) ; tant qu'il en reste en route, on montre le dernier choix. Quand tout a répondu, on
  // montre la dernière valeur que le serveur a acceptée, ou celle qu'il avait (après des échecs).
  const [policyChoice, setPolicyChoice] = useState<HiveInvitePolicy | null>(null)
  const [policyConfirmed, setPolicyConfirmed] = useState<HiveInvitePolicy>(page.invitePolicy)
  const policyPending = useRef(0)
  const [policyFailure, setPolicyFailure] = useState<ApiErrorKey | null>(null)
  const shownPolicy = policyChoice ?? policyConfirmed

  const choosePolicy = (policy: HiveInvitePolicy) => {
    if (policy === shownPolicy) return
    setPolicyChoice(policy)
    policyPending.current += 1
    mutateAsync({ invitePolicy: policy })
      .then(
        () => {
          setPolicyConfirmed(policy)
          setPolicyFailure(null)
        },
        (error: unknown) => {
          const key = errorKey(error)
          noteFailure(key)
          setPolicyFailure(key)
        },
      )
      .finally(() => {
        policyPending.current -= 1
        if (policyPending.current === 0) setPolicyChoice(null)
      })
  }

  const policyMessage =
    policyFailure && policyFailure !== 'unauthorized'
      ? refusalText(
          policyFailure,
          t(($) => $.hives.settings.policyError),
        )
      : null

  // --- Confier l'animation, supprimer -------------------------------------------------------------

  const [handOverOpen, setHandOverOpen] = useState(false)
  // Le membre choisi reste gardé pendant le fondu de sortie de la fenêtre (son nom est dans le titre).
  const [handOverTo, setHandOverTo] = useState<HiveMember | undefined>(undefined)
  const [confirmHandOver, setConfirmHandOver] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const handedOver = () => {
    leaving.current = true
    setConfirmHandOver(false)
    router.replace(`/hives/${id}`)
  }
  const deleted = () => {
    leaving.current = true
    setDeleteOpen(false)
    router.dismissTo('/hives')
  }

  return (
    <Screen
      header={<TopNav />}
      onBack={back}
      title={t(($) => $.hives.settings.title)}
      notice={
        expired ? <Notice message={t(($) => $.states.expired)} action={signInAgain()} /> : null
      }
    >
      <Stack gap="xl">
        <Stack gap="md">
          <Row gap="md" align="center" wrap>
            <HiveBadge icon={shownIcon} name={page.summary.name} size={64} />
            <Button
              label={t(($) => $.hives.settings.changeIcon)}
              icon="pencil-simple"
              variant="secondary"
              size="small"
              onPress={() => setIconOpen(true)}
            />
          </Row>
          {iconMessage && !iconOpen ? <Notice message={iconMessage} /> : null}
          <TextField
            label={t(($) => $.hives.settings.name)}
            value={name}
            onChangeText={setName}
            limit={HIVE_NAME_MAX}
            // Le compteur se voit toujours (« 7 / 40 », comme la planche), pas seulement près de la fin.
            showCount
            error={nameMessage}
            onBlur={saveName}
            onSubmitEditing={saveName}
            returnKeyType="done"
            autoCapitalize="sentences"
          />
        </Stack>

        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted" heading={2}>
            {t(($) => $.hives.settings.policy)}
          </Text>
          <Segmented<HiveInvitePolicy>
            label={t(($) => $.hives.settings.policy)}
            value={shownPolicy}
            onChange={choosePolicy}
            options={[
              { value: 'members', label: t(($) => $.hives.settings.policyMembers) },
              { value: 'animator', label: t(($) => $.hives.settings.policyAnimator) },
            ]}
          />
          {/* Sous le choix touché, jamais au-dessus : il ne descend pas sous le doigt (R8). */}
          {policyMessage ? <Notice message={policyMessage} /> : null}
        </Stack>

        <ListGroup>
          <ListRow
            label={t(($) => $.hives.settings.handOver)}
            detail={t(($) => $.hives.settings.handOverDetail)}
            icon="crown"
            trailing="chevron"
            onPress={() => setHandOverOpen(true)}
          />
        </ListGroup>

        <ListGroup>
          <ListRow
            label={t(($) => $.hives.settings.delete)}
            icon="trash"
            tone="danger"
            onPress={() => setDeleteOpen(true)}
          />
        </ListGroup>
      </Stack>

      <Sheet
        open={iconOpen}
        onClose={() => setIconOpen(false)}
        title={t(($) => $.hives.settings.iconSheet)}
      >
        <Stack gap="lg">
          <HiveIconPicker value={shownIcon} onChange={chooseIcon} />
          {iconMessage ? <Notice message={iconMessage} /> : null}
        </Stack>
      </Sheet>

      <HandOverSheet
        id={id}
        open={handOverOpen}
        onClose={() => setHandOverOpen(false)}
        onChoose={(member) => {
          setHandOverTo(member)
          setConfirmHandOver(true)
        }}
      />
      <HandOverDialog
        hive={page}
        member={handOverTo}
        open={confirmHandOver}
        onClose={() => setConfirmHandOver(false)}
        onDone={handedOver}
      />
      <DeleteHiveDialog
        hive={page}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDone={deleted}
      />
    </Screen>
  )
}

type HandOverSheetProps = {
  id: string
  open: boolean
  onClose: () => void
  onChoose: (member: HiveMember) => void
}

/**
 * La feuille « Confier l'animation » : les autres membres de la ruche, dans l'ordre de l'API (par
 * date d'entrée). Toucher un membre ouvre la fenêtre de confirmation par-dessus la feuille ;
 * « Annuler » y ramène.
 */
function HandOverSheet({ id, open, onClose, onChoose }: HandOverSheetProps) {
  const { t } = useTranslation()
  const members = useHiveMembers(id)
  const others = members.data?.members.filter((member) => !member.isMe) ?? []

  let content: ReactNode
  if (members.data) {
    content =
      others.length === 0 ? (
        <Text tone="muted">{t(($) => $.hives.settings.handOverNone)}</Text>
      ) : (
        <ListGroup list>
          {others.map((member) => {
            // Un membre qui nous a bloqués : son nom seul (relecture du plan, Q3). Un membre sans
            // pseudo (`handle` nul au contrat) : rien sous son nom, jamais « @null » (R10,
            // relecture de l'interface) ; le « @ » vient de la clé commune `member.handle`.
            const handle = member.reduced ? null : member.handle
            return (
              <ListRow
                key={member.face.id}
                label={member.face.name}
                detail={handle === null ? undefined : t(($) => $.member.handle, { handle })}
                trailing="chevron"
                onPress={() => onChoose(member)}
              />
            )
          })}
        </ListGroup>
      )
  } else if (members.error) {
    content = (
      <Notice
        message={t(($) => $.hives.page.loadError)}
        action={{
          label: t(($) => $.common.retry),
          onPress: () => void members.refetch(),
          role: 'button',
        }}
      />
    )
  } else {
    content = <SkeletonList count={2} />
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(($) => $.hives.settings.handOver)}
      subtitle={t(($) => $.hives.settings.handOverHint)}
    >
      {content}
    </Sheet>
  )
}
