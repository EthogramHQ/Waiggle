// La section « Les mises à jour » de la page d'un projet (R7a, scénarios « Les mises à jour sur la
// page projet », « Supprimer une mise à jour » et « Quand le statut change » ; planche
// R7-MAJ-Projet). Elle remplace le Journal des notes (tranche 4b) :
// - la dernière mise à jour, montrée en entier (ui/UpdateEntry.tsx), son titre en niveau 3 sous le
//   titre de la section (niveau 2) ;
// - « Voir les 3 mises à jour », qui mène à la frise (/projects/<id>/updates) ;
// - pour l'auteur : la corbeille de la mise à jour (une fenêtre demande confirmation), l'état vide
//   tant qu'il n'a rien publié, et « Publier une mise à jour », qui ouvre la feuille ;
// - pour un autre membre : « Signaler cette mise à jour » ; sans mise à jour, pas de section du tout.
//
// La feuille « Nouvelle mise à jour » a sa propre adresse (/projects/<id>/update, écrans
// UpdateSheet.tsx) : elle se pose sur la page, qui reste montée dessous. `useUpdateSheet` l'ouvre,
// depuis la section, depuis le menu « … » de la page, ou tout seul quand l'auteur revient de
// « Modifier » avec un nouveau statut (?announce=testable). Quand la feuille se ferme, la page
// redevient affichée : le focus revient au bouton qui l'avait ouverte, au lieu de repartir du haut.
import { type Project, ProjectStatus } from '@ruche/contracts'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { firstParam } from '../navigation/params'
import { useSignInAgain } from '../navigation/signInAgain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Notice } from '../ui/Notice'
import { Row } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { useScreenFocused } from '../ui/screenFocus'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useHydrated } from '../ui/theme/hydration'
import { UpdateEntry } from '../ui/UpdateEntry'
import { type UpdateFailure, useDeleteUpdate } from '../updates/api'

/**
 * Hook : ouvrir la feuille « Nouvelle mise à jour » et rendre le focus, à son retour, au contrôle
 * qui l'a ouverte. `allowed` : l'auteur, sur un projet que la modération n'a pas retiré, avec un
 * compte non suspendu (l'API refuserait la publication des autres).
 *
 * Il ouvre aussi la feuille de lui-même quand l'adresse porte `?announce=<statut>` : l'auteur
 * arrive de « Modifier », où il vient de changer le statut, et la feuille propose de l'annoncer.
 * Seulement pour lui, et pour un vrai statut : une adresse fabriquée n'ouvre rien.
 */
export function useUpdateSheet(projectId: string, allowed: boolean) {
  const router = useRouter()
  // « Publier une mise à jour » de la section : il reprend le focus au retour d'une feuille ouverte
  // par lui, ou ouverte toute seule par ?announce=.
  const addRef = useRef<Focusable>(null)
  // Le contrôle qui recevra le focus quand la page redeviendra affichée (la feuille fermée).
  const returnTo = useRef<RefObject<Focusable | null> | null>(null)

  const open = useCallback(
    (from: RefObject<Focusable | null> = addRef, announce?: ProjectStatus) => {
      returnTo.current = from
      router.push({
        pathname: '/projects/[id]/update',
        params: announce ? { id: projectId, announce } : { id: projectId },
      })
    },
    [router, projectId],
  )

  // La page quittée pour la feuille, puis retrouvée : on rend le focus, une seule fois. Une image
  // plus tard, le temps que la feuille quitte la page (avant, son piège à focus le garderait).
  const shown = useScreenFocused()
  const wasShown = useRef(shown)
  useEffect(() => {
    const before = wasShown.current
    wasShown.current = shown
    if (!shown || before) return
    const target = returnTo.current
    returnTo.current = null
    if (!target) return
    requestAnimationFrame(() => {
      focusWithoutScroll(target.current)
      moveReaderTo(target.current)
    })
  }, [shown])

  // ?announce=<statut> : l'adresse n'est connue que dans le navigateur, on attend d'y être
  // (ui/theme/hydration.ts). Le statut déjà proposé ne rouvre pas la feuille.
  const announced = firstParam(useLocalSearchParams<{ announce?: string | string[] }>().announce)
  const hydrated = useHydrated()
  const proposed = useRef<string | null>(null)
  useEffect(() => {
    if (!hydrated || !allowed || !announced || proposed.current === announced) return
    const status = ProjectStatus.safeParse(announced)
    if (!status.success) return
    proposed.current = announced
    // Le paramètre quitte l'adresse de la page (avant d'ouvrir la feuille : `setParams` touche la
    // page affichée) : la recharger ne rouvre pas la feuille.
    router.setParams?.({ announce: undefined })
    open(addRef, status.data)
  }, [hydrated, allowed, announced, router, open])

  return { open, addRef }
}

export type UpdateSheetOpener = ReturnType<typeof useUpdateSheet>

type Props = {
  project: Project
  /** Vrai si l'auteur peut publier (voir `useUpdateSheet`). */
  canPublish: boolean
  /** La feuille, ouverte par la section comme par le menu « … » de la page. */
  sheet: UpdateSheetOpener
}

/**
 * La section. À part de la page : ses états (la mise à jour à supprimer, le message affiché) ne
 * redessinent pas toute la page.
 */
export function ProjectUpdatesSection({ project, canPublish, sheet }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const toSource = useMediaSources()
  const signInAgain = useSignInAgain()
  const deleteUpdate = useDeleteUpdate(project.id)
  const update = project.latestUpdate

  // La mise à jour dont on demande confirmation de la suppression (une à la fois).
  const [deleting, setDeleting] = useState<Project['latestUpdate']>(null)
  const [removing, setRemoving] = useState(false)
  // Deux appuis dans le même instant arrivent avant que « Supprimer » ne passe en « en cours » : ce
  // drapeau, posé au premier, fait ignorer le second (une seule suppression envoyée).
  const sending = useRef(false)
  // Les erreurs de React Query restent jusqu'au prochain envoi : on ne les montre qu'après un envoi.
  const [showDeleteError, setShowDeleteError] = useState(false)
  // « Mise à jour supprimée. », jusqu'au geste suivant.
  const [deleted, setDeleted] = useState(false)
  // « Annuler » reçoit le focus à l'ouverture de la fenêtre (une suppression ne se défait pas).
  const cancelRef = useRef<Focusable>(null)
  // Le titre de la mise à jour qui prend la place de la supprimée, s'il y en a une ; sinon le focus
  // va au titre de la section.
  const entryTitleRef = useRef<Focusable>(null)
  const sectionTitleRef = useRef<Focusable>(null)
  const focusAfterClose = useRef(false)

  // Pour un autre membre : pas de section sans mise à jour à lire.
  if (!project.isMine && !update) return null

  const confirmDelete = async () => {
    if (!deleting || sending.current) return
    sending.current = true
    setRemoving(true)
    setShowDeleteError(true)
    const ok = await deleteUpdate.remove(deleting.id)
    sending.current = false
    setRemoving(false)
    // Refusée : la fenêtre reste ouverte, avec le message ; « Supprimer » permet de réessayer.
    if (!ok) return
    // Supprimée : sa corbeille n'existe plus ; le focus ira à ce qui prend sa place, une fois la
    // fenêtre refermée. « Mise à jour supprimée. » le confirme.
    focusAfterClose.current = true
    setDeleted(true)
    setDeleting(null)
  }

  // Le message d'une suppression refusée : la session expirée se dit (« Réessaie » n'y ferait
  // rien), avec « Me reconnecter », qui referme d'abord la fenêtre.
  const failure = (reason: UpdateFailure | undefined) =>
    reason === 'expired' ? t(($) => $.states.expired) : t(($) => $.project.updates.deleteError)

  const removed = deleting?.removal ?? update?.removal ?? null

  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <Text variant="heading" heading={2} focusRef={sectionTitleRef}>
        {t(($) => $.project.updates.title)}
      </Text>
      {update ? (
        <UpdateEntry
          update={update}
          toSource={toSource}
          headingLevel={3}
          focusRef={entryTitleRef}
          {...(project.isMine
            ? {
                onDelete: () => {
                  setShowDeleteError(false)
                  setDeleted(false)
                  setDeleting(update)
                },
                deleting: removing,
              }
            : {
                onReport: () =>
                  router.push({ pathname: '/report', params: { kind: 'update', id: update.id } }),
              })}
        />
      ) : project.updateCount === 0 ? (
        // L'état vide, que seul l'auteur voit : qui sera prévenu (personne, sur un projet privé).
        <Text tone="secondary" readable>
          {project.visibility === 'private'
            ? t(($) => $.project.updates.emptyPrivate)
            : t(($) => $.project.updates.empty)}
        </Text>
      ) : null}
      {/* Après une suppression : la confirmation, lue sans interrompre. */}
      {deleted ? (
        <Notice tone="success" message={t(($) => $.project.updates.deleted)} polite />
      ) : null}
      {project.updateCount > 0 ? (
        // Dans une rangée : le lien garde la largeur de son texte.
        <Row>
          <TextLink
            label={t(($) => $.project.updates.seeAll, { count: project.updateCount })}
            onPress={() =>
              router.push({ pathname: '/projects/[id]/updates', params: { id: project.id } })
            }
          />
        </Row>
      ) : null}
      {/* Un projet retiré ne reçoit plus de mise à jour (l'API refuserait), un compte suspendu n'en
          publie pas : le bouton disparaît. La seule action miel de la page reste « Tester la
          démo » : celle-ci est blanche. */}
      {canPublish ? (
        <Row>
          <Button
            ref={sheet.addRef}
            label={t(($) => $.project.updates.add)}
            icon="megaphone-simple"
            variant="secondary"
            onPress={() => sheet.open(sheet.addRef)}
          />
        </Row>
      ) : null}
      {/* Supprimer une mise à jour est définitif : une fenêtre demande confirmation. */}
      <Dialog
        visible={deleting !== null}
        guardTaps
        title={t(($) => $.project.updates.deleteTitle)}
        // Retirée par la modération : la décision et la copie du signalement restent gardées.
        message={
          removed
            ? t(($) => $.project.updates.deleteBodyRemoved)
            : t(($) => $.project.updates.deleteBody)
        }
        initialFocusRef={cancelRef}
        busy={removing}
        // Pendant la suppression, la fenêtre reste ouverte : la fermer perdrait le focus prévu après.
        onDismiss={() => {
          if (!removing) setDeleting(null)
        }}
        onClosed={() => {
          if (!focusAfterClose.current) return
          focusAfterClose.current = false
          // Le temps que la fenêtre quitte la page : avant, elle garderait le focus pour elle.
          requestAnimationFrame(() => {
            const target = entryTitleRef.current ?? sectionTitleRef.current
            focusWithoutScroll(target)
            moveReaderTo(target)
          })
        }}
      >
        {showDeleteError && deleteUpdate.error ? (
          <Notice
            message={failure(deleteUpdate.reason)}
            action={
              deleteUpdate.reason === 'expired' ? signInAgain(() => setDeleting(null)) : undefined
            }
          />
        ) : null}
        <Button
          label={t(($) => $.project.updates.confirmDelete)}
          variant="confirm"
          onPress={() => void confirmDelete()}
          loading={removing}
        />
        <Button
          ref={cancelRef}
          label={t(($) => $.common.cancel)}
          variant="secondary"
          onPress={() => setDeleting(null)}
          disabled={removing}
        />
      </Dialog>
    </Surface>
  )
}
