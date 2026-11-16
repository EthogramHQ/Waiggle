// « Mon profil public » (tranche R12, planche R12-Profil-Public) : le membre rend sa page visible
// de tous, et choisit ce qu'elle montre. Ouvert depuis « Mon profil » (/settings/public-page).
//
// - « Rendre ma page publique » est un interrupteur : tant que la page est fermée, aucune case.
// - Ouverte, « Ce que voit un visiteur » : le nom et la photo (toujours, case cochée et inactive),
//   puis la bio, les outils favoris, les projets publics et le nombre d'abonnés. Sous « Mes projets
//   publics », combien de ses projets sont publics ; les autres restent entre membres.
// - Chaque geste envoie seulement le champ changé (`usePublicPageChange`) ; un refus remet la case
//   et dit pourquoi. Jamais le pseudo, nulle part sur cette page (Q8).
// - « Voir ma page comme un visiteur » remplace l'écran par l'aperçu, sans quitter l'adresse :
//   c'est `PublicMemberScreen` en mode `preview`, qui lit la route d'un visiteur, sans cookie (plan
//   R12, décision 15). Un lien vers `/fr/members/<id>` montrerait au membre sa vue de membre, ses
//   projets privés et son pseudo compris.
// - Un membre suspendu ne peut que fermer sa page (Q6) : l'interrupteur reste actif seulement
//   tant que la page est ouverte, les cases sont inactives, et une phrase dit pourquoi.
//
// Ce fichier assemble des pièces faites ailleurs, sans écrire de style (règle des étages).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemberSession } from '../accounts/session'
import { useGoBack } from '../navigation/useGoBack'
import { usePublicPageChange, usePublicPageSettings } from '../profile/api'
import { useMe } from '../profile/hooks'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { Hint } from '../ui/Hint'
import { ListGroup } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { Switch } from '../ui/Switch'
import { PublicMemberScreen } from './PublicMemberScreen'
import { LoadErrorScreen, LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

export function PublicPageSettingsScreen() {
  const { t } = useTranslation()
  const { state, session, retry: retrySession } = useMemberSession()
  const signedIn = Boolean(session)
  const me = useMe(signedIn)
  const page = usePublicPageSettings(signedIn)
  const { change, error } = usePublicPageChange()
  const back = useGoBack('/settings/profile')
  // L'aperçu est posé dans l'écran : « Retour » le referme et rend le focus à son bouton.
  const [previewing, setPreviewing] = useState(false)
  const previewButton = useRef(null)
  const wasPreviewing = useRef(false)
  useEffect(() => {
    if (wasPreviewing.current && !previewing) {
      focusWithoutScroll(previewButton.current)
      moveReaderTo(previewButton.current)
    }
    wasPreviewing.current = previewing
  }, [previewing])

  if (state === 'pending') return <LoadingScreen />
  if (state === 'error') return <SessionErrorScreen onRetry={retrySession} />
  if (!session) return <SignedOutScreen />
  if (page.error && !page.data) {
    return (
      <LoadErrorScreen
        error={page.error}
        onRetry={() => void page.refetch()}
        fallback="/settings/profile"
      />
    )
  }
  if (!page.data || !me.data) return <LoadingScreen />

  const { settings, webProjectCount, projectCount } = page.data
  // Un membre suspendu ne peut que fermer sa page (Q6) : l'API refuse le reste en 403.
  const suspended = me.data.suspension !== null && me.data.suspension !== undefined
  const projectsDetail =
    webProjectCount === 0
      ? t(($) => $.profile.publicPage.projectsNone)
      : webProjectCount === projectCount
        ? t(($) => $.profile.publicPage.projectsAll, {
            count: webProjectCount,
            total: projectCount,
          })
        : t(($) => $.profile.publicPage.projectsCount, {
            count: webProjectCount,
            total: projectCount,
          })

  if (previewing) {
    return <PublicMemberScreen id={me.data.id} preview onClose={() => setPreviewing(false)} />
  }

  return (
    <Screen
      title={t(($) => $.profile.publicPage.title)}
      onBack={back}
      backLabel={t(($) => $.settings.sections.profile)}
    >
      <Stack gap="lg">
        {suspended ? (
          <Notice tone="info" polite message={t(($) => $.profile.publicPage.suspended)} />
        ) : null}
        <ListGroup>
          <Switch
            inGroup
            label={t(($) => $.profile.publicPage.toggle)}
            hint={t(($) => $.profile.publicPage.toggleHint)}
            value={settings.publicPage}
            disabled={suspended && !settings.publicPage}
            onValueChange={(value) => change({ publicPage: value })}
          />
        </ListGroup>
        {settings.publicPage ? (
          <>
            <ListGroup title={t(($) => $.profile.publicPage.visitorSees)}>
              {/* Le nom et la photo sont toujours montrés : cochée et inactive, avec son pourquoi. */}
              <Checkbox
                inGroup
                label={t(($) => $.profile.publicPage.nameAndPhoto)}
                detail={t(($) => $.profile.publicPage.nameAndPhotoHint)}
                value
                disabled
                onValueChange={() => {}}
              />
              <Checkbox
                inGroup
                label={t(($) => $.profile.publicPage.bio)}
                value={settings.showBio}
                disabled={suspended}
                onValueChange={(value) => change({ showBio: value })}
              />
              <Checkbox
                inGroup
                label={t(($) => $.profile.publicPage.tools)}
                value={settings.showFavoriteTools}
                disabled={suspended}
                onValueChange={(value) => change({ showFavoriteTools: value })}
              />
              <Checkbox
                inGroup
                label={t(($) => $.profile.publicPage.projects)}
                detail={projectsDetail}
                value={settings.showProjects}
                disabled={suspended}
                onValueChange={(value) => change({ showProjects: value })}
              />
              <Checkbox
                inGroup
                label={t(($) => $.profile.publicPage.followerCount)}
                value={settings.showFollowerCount}
                disabled={suspended}
                onValueChange={(value) => change({ showFollowerCount: value })}
              />
            </ListGroup>
            <Hint icon="eye-slash" text={t(($) => $.profile.publicPage.never)} />
          </>
        ) : null}
        {error ? <Notice message={t(($) => $.profile.publicPage.error)} /> : null}
        {settings.publicPage ? (
          <Button
            ref={previewButton}
            label={t(($) => $.profile.publicPage.preview)}
            variant="secondary"
            icon="eye"
            onPress={() => setPreviewing(true)}
          />
        ) : null}
      </Stack>
    </Screen>
  )
}
