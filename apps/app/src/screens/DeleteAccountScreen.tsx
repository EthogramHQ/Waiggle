// Page « Supprimer ton compte » : ce qui disparaît, puis deux étapes. 1. Garder une copie de ses
// données (facultatif). 2. Confirmer avec son mot de passe. La suppression est immédiate et
// définitive : la page le dit clairement avant le bouton.
// Depuis la tranche R2, tout se passe dans une feuille posée sur les réglages (ui/Sheet.tsx) : en
// tête, la photo du membre et les couvertures de ses projets (un décor, la liste dit ce qui part) ;
// « Mot de passe oublié ? » sous le mot de passe ; en bas, collés, l'avertissement, le bouton et
// « Annuler ». Tout ce que la page disait reste (relecture juridique du plan, jur-12), sans mascotte
// triste ni phrase qui culpabilise.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteAccount, downloadMyData } from '../accounts/api'
import { SessionGate } from '../accounts/SessionGate'
import type { SessionData } from '../accounts/session'
import { useMediaSources } from '../api/media'
import { useMember } from '../members/api'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { focusAndReveal } from '../ui/focus'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { PhotoStack } from '../ui/PhotoStack'
import { Screen } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Step } from '../ui/StepNumber'
import { Text } from '../ui/Text'
import { TextField, type TextFieldInput } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { useCalmMotion } from '../ui/theme/motion'
import { LoadingScreen } from './states'

// Paramètres des messages qui citent les longueurs de mot de passe.
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/**
 * R16 : la garde de session commune (accounts/SessionGate.tsx). En attente, le squelette d'un
 * formulaire ; la session ne se lit pas (trop de demandes, serveur en panne) : « Réessayer », on ne
 * sait pas qui est là ; personne de connecté : « Réservé aux membres » (et retour ici ensuite).
 */
export function DeleteAccountScreen() {
  return (
    <SessionGate loading={<LoadingScreen shape="form" />}>
      {(session) => <DeleteAccount session={session} />}
    </SessionGate>
  )
}

/** La feuille elle-même, une fois la session lue : ses hooks vivent ici, jamais dans la garde. */
function DeleteAccount({ session: data }: { session: SessionData }) {
  const { t } = useTranslation()
  const router = useRouter()
  // Le profil, pour citer le pseudo qui redevient libre (lu dans le cache s'il y est déjà). Il ne
  // se demande qu'une fois la session lue : la garde ne dessine cette feuille qu'à ce moment.
  const me = useMe()
  const [password, setPassword] = useState('')
  // Le refus du dernier essai : écrit dans le pied de la feuille, près du bouton touché (relecture
  // de design R2, B2) ; le champ, lui, passe en erreur sans répéter la phrase.
  const [error, setError] = useState<string | null>(null)
  // Le champ du mot de passe, tout en bas de la feuille : une tape sans mot de passe l'amène dans
  // l'écran avec le focus (C2).
  const passwordInput = useRef<TextFieldInput>(null)
  const calm = useCalmMotion()
  const [exportMessage, setExportMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)

  // « Fermer » et « Annuler » reviennent aux réglages (la page d'avant, ou /settings par un lien
  // direct).
  const sheet = useRouteSheet('/settings')
  const back = sheet.close
  // La page du membre, pour les couvertures de ses projets en tête de la feuille. Si elle ne se
  // lit pas, la feuille montre sa seule photo : rien d'autre n'en dépend.
  const member = useMember(me.data?.id ?? '', Boolean(me.data))
  const toSource = useMediaSources()

  const onExport = async () => {
    setBusy('export')
    const result = await downloadMyData()
    setBusy(null)
    setExportMessage(
      result.ok
        ? { text: t(($) => $.account.export.done), ok: true }
        : { text: t(($) => $.auth.errors[result.error], lengths), ok: false },
    )
  }

  const onDelete = async () => {
    // Sans mot de passe, le bouton reste actif (relecture de design R2, C2) : grisé, il ne disait
    // rien, et le champ était loin sous le pied. La tape dit quoi faire, dans le pied, et amène le
    // champ dans l'écran, avec le focus. Rien n'est envoyé.
    if (password.length === 0) {
      setError(t(($) => $.errors.passwordRequired))
      focusAndReveal(passwordInput.current, calm)
      return
    }
    setBusy('delete')
    const result = await deleteAccount(password)
    setBusy(null)
    if (result.ok) {
      router.replace('/')
      return
    }
    setError(
      result.error === 'wrongPassword'
        ? t(($) => $.account.delete.wrongPassword)
        : t(($) => $.auth.errors[result.error], lengths),
    )
  }

  const title = t(($) => $.account.delete.sheetTitle)
  // Pendant la suppression, rien ne quitte la feuille : la suppression continuerait derrière elle,
  // et « Annuler » mentirait sur une action définitive (relecture de l'interface, B1).
  const deleting = busy === 'delete'
  const covers = (member.data?.projects ?? []).map((project) => ({
    key: project.id,
    source: toSource(project.cover?.url),
    thumbhash: project.cover?.thumbhash ?? null,
  }))

  return (
    <Screen pageTitle={title}>
      <Sheet
        open={sheet.open}
        onClose={back}
        busy={deleting}
        title={title}
        // La feuille est toute la page : son titre est celui de la page (niveau 1).
        heading={1}
        // Le refus, en tête du pied, juste au-dessus de « Supprimer définitivement » : en vue, et
        // lu dès qu'il paraît (une alerte).
        notice={error ? { message: error } : null}
        decoration={
          <PhotoStack name={data.user.name} avatar={toSource(me.data?.avatarUrl)} covers={covers} />
        }
        // Collés en bas : ce qu'il faut savoir avant d'appuyer, le bouton, puis la sortie.
        footer={
          <>
            <Row gap="sm" justify="center">
              <Icon name="warning" size={18} tone="danger" />
              <Text weight={700} tone="danger">
                {t(($) => $.account.delete.warning)}
              </Text>
            </Row>
            <Button
              label={t(($) => $.account.delete.submit)}
              variant="confirm"
              icon="trash"
              onPress={() => void onDelete()}
              loading={deleting}
            />
            <Row justify="center">
              <TextLink
                label={t(($) => $.common.cancel)}
                onPress={back}
                role="button"
                disabled={deleting}
              />
            </Row>
          </>
        }
      >
        {/* RF (jur-RF1) : la liste porte son titre, en face de « Ce qui reste », au lieu d'un
            sous-titre qui l'annonçait. */}
        <ListGroup title={t(($) => $.account.delete.goesTitle)}>
          <ListRow
            icon="user"
            label={t(($) => $.account.delete.profileItem)}
            detail={data.user.name}
          />
          {/* Tranche 6a : son pseudo n'est pas mis en réserve, un autre membre peut le prendre. Le
            pseudo vient du profil (la session ne le porte pas) : tant qu'il n'est pas arrivé,
            la ligne reste sans détail plutôt que d'attendre. */}
          <ListRow
            icon="at"
            label={t(($) => $.account.delete.handleItem)}
            {...(me.data
              ? { detail: t(($) => $.account.delete.handleDetail, { handle: me.data.handle }) }
              : null)}
          />
          <ListRow
            icon="images"
            label={t(($) => $.account.delete.projectsItem)}
            detail={t(($) => $.account.delete.projectsDetail)}
          />
          <ListRow icon="users" label={t(($) => $.account.delete.followsItem)} />
          {/* R10 (relecture juridique, C5) : on quitte chaque ruche ; l'animation passe au membre le
            plus ancien, et la dernière ruche sans membre est supprimée. Même phrase pour tous : la
            page s'affiche aussi à qui n'a aucune ruche. */}
          <ListRow
            icon="hexagon"
            label={t(($) => $.account.delete.hivesItem)}
            detail={t(($) => $.account.delete.hivesDetail)}
          />
          {/* Tranche 5 : ses réactions et ses commentaires partent aussi ; un commentaire qui a des
            réponses devient « Commentaire supprimé », pour que les réponses des autres restent. */}
          <ListRow
            icon="chat-circle"
            label={t(($) => $.account.delete.reactionsItem)}
            detail={t(($) => $.account.delete.reactionsDetail)}
          />
          {/* R7b : ses retours de testeur partent avec leurs captures, fil entier (réponses des
            auteurs comprises) : le membre le lit avant de confirmer. */}
          <ListRow
            icon="chat-circle-dots"
            label={t(($) => $.account.delete.testerFeedbackItem)}
            detail={t(($) => $.account.delete.testerFeedbackDetail)}
          />
          {/* Tranche 6b : ses notifications et ses mentions partent aussi ; ses gestes sortent des
            notifications des autres, qui sont calculées et non recopiées. */}
          <ListRow
            icon="bell"
            label={t(($) => $.account.delete.notificationsItem)}
            detail={t(($) => $.account.delete.notificationsDetail)}
          />
          {/* Tranche 7b : ses blocages partent avec lui, et ceux qui le visaient aussi (une ligne
            de la base relie toujours deux comptes : sans l'un, elle n'a plus de sens). */}
          <ListRow
            icon="prohibit"
            label={t(($) => $.account.delete.blocksItem)}
            detail={t(($) => $.account.delete.blocksDetail)}
          />
        </ListGroup>

        {/* Tranche 7a (règle 24 de la relecture du plan) : ce qui ne part pas tout de suite. Ses
          signalements restent, sans son nom, et une trace des retraits de ses contenus, un an. */}
        <ListGroup title={t(($) => $.account.delete.remains.title)}>
          {/* R10 : le nom d'une ruche qu'on a créée reste (c'est un bien commun de ses membres). */}
          <ListRow icon="hexagon" label={t(($) => $.account.delete.remains.hiveNames)} />
          {/* R10, relecture juridique (C4) : les invitations envoyées restent valables, sans le
              nom de qui part (`inviter_id` remis à null) ; les reçues partent avec le compte. */}
          <ListRow icon="user-plus" label={t(($) => $.account.delete.remains.hiveInvitations)} />
          <ListRow icon="flag" label={t(($) => $.account.delete.remains.reports)} />
          <ListRow icon="clock" label={t(($) => $.account.delete.remains.removals)} />
          {/* Tranche 7b (relecture juridique du plan, J11) : la copie des textes signalés, gardée
            pour que la modération puisse décider. Au conditionnel : l'écran s'affiche pour tous. */}
          <ListRow icon="note-pencil" label={t(($) => $.account.delete.remains.reportCopies)} />
          {/* R12 (relecture juridique, point 3) : ce qui a été public a pu être copié par les
            moteurs de recherche ; l'appli ne peut pas l'effacer chez eux, les Règles le disent. */}
          <ListRow icon="globe-simple" label={t(($) => $.account.delete.remains.searchCopies)} />
        </ListGroup>

        {/* Deux étapes, dans l'ordre : on garde d'abord une copie, puis on confirme. */}
        <Step
          value={1}
          control={
            <Button
              label={t(($) => $.account.export.button)}
              variant="secondary"
              icon="download-simple"
              onPress={() => void onExport()}
              loading={busy === 'export'}
            />
          }
        >
          <Text variant="caption" tone="muted">
            {t(($) => $.account.delete.exportHint)}
          </Text>
          {exportMessage ? (
            <Notice tone={exportMessage.ok ? 'success' : 'error'} message={exportMessage.text} />
          ) : null}
        </Step>
        <Step
          value={2}
          control={
            <Stack gap="xs">
              <TextField
                label={t(($) => $.account.delete.password)}
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  // Le membre corrige : le refus d'avant s'efface (le pied rétrécit vers le bas, le
                  // bouton ne bouge pas).
                  setError(null)
                }}
                secureTextEntry
                autoComplete="current-password"
                inputRef={passwordInput}
                invalid={error !== null}
              />
              {/* Mot de passe oublié : on en choisit un nouveau d'abord (relecture juridique, jur-12). */}
              <Row justify="end">
                <TextLink
                  label={t(($) => $.auth.signIn.forgotPassword)}
                  onPress={() => router.push('/forgot-password')}
                  disabled={deleting}
                />
              </Row>
            </Stack>
          }
        />
      </Sheet>
    </Screen>
  )
}
