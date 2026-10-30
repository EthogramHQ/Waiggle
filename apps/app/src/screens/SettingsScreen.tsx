// La page « Réglages » (tranche R2), qui remplace « Mon compte ». En tête, la carte du membre
// (« Voir ma page », « Modifier ») ; puis les rubriques : Mon profil, Notifications, Langue,
// Apparence, Mes données, Sécurité, Compte, À propos, et Modération pour un administrateur.
//
// Sur téléphone et tablette, deux pages : la liste des rubriques (/settings), puis la rubrique
// choisie (/settings/<rubrique>), avec un retour vers la liste. Sur ordinateur, une seule page : la
// colonne des rubriques à gauche, la rubrique ouverte à droite, et l'adresse qui suit la rubrique.
// « Mon profil » ouvre l'écran du profil (/settings/profile), « Modération » sa page (/moderation).
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { useSession } from '../accounts/api'
import { useMediaSources } from '../api/media'
import { TopNav } from '../navigation/TopNav'
import { useGoBack } from '../navigation/useGoBack'
import { useMe } from '../profile/hooks'
import type { IconName } from '../ui/Icon'
import type { PressEvent } from '../ui/ListGroup'
import { MemberCard } from '../ui/MemberCard'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { SettingsColumns } from '../ui/SettingsColumns'
import { SettingsNav, type SettingsNavItem } from '../ui/SettingsNav'
import { useLayout } from '../ui/theme/layout'
import { type ContentSection, SettingsSection } from './settings/sections'
import { LoadingScreen, SessionErrorScreen, SignedOutScreen } from './states'

/** Les rubriques des réglages, dans l'ordre du scénario. */
export type SettingsSectionKey = 'profile' | ContentSection | 'moderation'

/** Les rubriques, avec leur icône et la page où elles mènent. */
const catalog: { key: SettingsSectionKey; icon: IconName; href: string }[] = [
  { key: 'profile', icon: 'user', href: '/settings/profile' },
  { key: 'notifications', icon: 'bell', href: '/settings/notifications' },
  { key: 'language', icon: 'translate', href: '/settings/language' },
  { key: 'appearance', icon: 'circle-half', href: '/settings/appearance' },
  { key: 'data', icon: 'download-simple', href: '/settings/data' },
  { key: 'security', icon: 'lock-simple', href: '/settings/security' },
  { key: 'account', icon: 'gear-six', href: '/settings/account' },
  { key: 'about', icon: 'info', href: '/settings/about' },
  // Tranche 7a : la page de modération garde son adresse.
  { key: 'moderation', icon: 'shield-check', href: '/moderation' },
]

/** Les rubriques qui n'ont pas leur contenu ici, et la page qui les montre. */
const ownPages = { profile: '/settings/profile', moderation: '/moderation' } as const

/** Sur ordinateur, la rubrique montrée à droite quand l'adresse n'en nomme aucune (/settings). */
const firstContent: ContentSection = 'notifications'

type Props = {
  /** La rubrique ouverte (/settings/<rubrique>) ; sans elle, la page /settings. */
  section?: SettingsSectionKey
}

export function SettingsScreen({ section }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { sizeClass } = useLayout()
  const wide = sizeClass === 'wide'
  const { data, isPending, error: sessionError, refetch } = useSession()
  const me = useMe(Boolean(data))
  const toSource = useMediaSources()
  // Une relecture du profil demandée par « Réessayer » est en cours : pendant ce temps, React Query
  // efface l'erreur ; le message reste, sinon il disparaîtrait avec le bouton qui a le focus.
  const [retryingMe, setRetryingMe] = useState(false)
  const retryMe = async () => {
    if (retryingMe) return
    setRetryingMe(true)
    await me.refetch()
    setRetryingMe(false)
  }
  // Le retour : de la liste vers l'accueil ; d'une rubrique (téléphone) vers la liste.
  const back = useGoBack(section && !wide ? '/settings' : '/')

  // Mon profil et Modération ont leur propre page : une adresse qui les nomme y mène.
  if (section === 'profile' || section === 'moderation')
    return <Redirect href={ownPages[section]} />
  if (isPending) return <LoadingScreen />
  // La session ne se lit pas (serveur en panne) : on ne sait pas qui est là, on propose de réessayer.
  if (sessionError && !data) return <SessionErrorScreen onRetry={() => void refetch()} />
  // Personne de connecté : on propose de se connecter (et de revenir ici ensuite).
  if (!data) return <SignedOutScreen />

  const label = (key: SettingsSectionKey) => t(($) => $.settings.sections[key])
  // La modération, pour un administrateur seulement : elle apparaît quand le profil est arrivé. Ce
  // champ ne donne aucun droit, l'API refait la vérification.
  const items: SettingsNavItem<SettingsSectionKey>[] = catalog
    .filter(({ key }) => key !== 'moderation' || me.data?.isAdmin === true)
    .map(({ key, icon, href }) => ({
      key,
      icon,
      href,
      label: label(key),
      hint: t(($) => $.settings.hints[key]),
    }))

  // Le profil ne se charge pas : la page le dit en tête, et tout le reste reste utilisable.
  // Seulement sans profil déjà là : une relecture ratée garde ce qui est affiché.
  const notice =
    (me.isError || retryingMe) && !me.data ? (
      <Notice
        message={t(($) => $.account.loadError)}
        action={{ label: t(($) => $.common.retry), onPress: retryMe }}
      />
    ) : undefined

  // La carte du membre. Son nom et sa page viennent du profil ; en panne, le nom de la session.
  const profile = me.data
  const card = (
    <MemberCard
      name={profile?.name ?? (me.isError ? data.user.name : null)}
      loadingLabel={t(($) => $.common.loading)}
      avatar={toSource(profile?.avatarUrl)}
      avatarLabel={t(($) => $.profile.avatar.label)}
      {...(profile
        ? {
            viewPage: {
              label: t(($) => $.settings.viewPage),
              href: `/members/${profile.id}`,
              onPress: (event?: PressEvent) => {
                if (Platform.OS === 'web') event?.preventDefault?.()
                router.push(`/members/${profile.id}`)
              },
            },
          }
        : null)}
      edit={{ label: t(($) => $.settings.edit), onPress: () => router.push('/settings/profile') }}
    />
  )
  const navLabel = t(($) => $.settings.title)

  // Ordinateur : la colonne et la rubrique côte à côte, sous la carte.
  if (wide) {
    const shown = section ?? firstContent
    return (
      <Screen
        header={<TopNav inSettings />}
        onBack={back}
        title={navLabel}
        // Le titre de l'onglet suit la rubrique ouverte (WCAG 2.4.2, relecture juridique, jur-15).
        pageTitle={section ? label(shown) : navLabel}
        width="page"
        notice={notice}
      >
        {card}
        <SettingsColumns
          nav={<SettingsNav label={navLabel} items={items} current={shown} />}
          title={label(shown)}
          current={shown}
        >
          <SettingsSection section={shown} email={data.user.email} />
        </SettingsColumns>
      </Screen>
    )
  }

  // Téléphone et tablette, une rubrique : sa page, avec un retour vers la liste.
  if (section) {
    return (
      <Screen header={<TopNav inSettings />} onBack={back} title={label(section)}>
        <SettingsSection section={section} email={data.user.email} />
      </Screen>
    )
  }

  // Téléphone et tablette, la liste : la carte, puis une ligne par rubrique.
  return (
    <Screen header={<TopNav inSettings />} onBack={back} title={navLabel} notice={notice}>
      {card}
      <SettingsNav label={navLabel} items={items} />
    </Screen>
  )
}
