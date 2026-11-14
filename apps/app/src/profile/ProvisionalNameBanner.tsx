// Le bandeau du pseudo (ou du nom) provisoire, sur « Moi » (R9, 7d ; décision L3 de Louis) : tant
// que le membre n'en a pas choisi un autre, il lit « Ton pseudo provisoire est @membre_4f2a.
// Choisis-en un autre. », juste au-dessus de « Modifier mon profil », où il le change. La feuille
// du pseudo (`ProvisionalNameSheet`) ne paraît qu'une fois par visite ; ce bandeau, lui, reste.
// Il lit le profil gardé en cache (/v1/me) : relu après un rétablissement par la modération, il
// disparaît de lui-même.
import { useTranslation } from 'react-i18next'
import { Notice } from '../ui/Notice'
import { Stack } from '../ui/Stack'
import { useMe } from './hooks'

export function ProvisionalNameBanner() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  if (!me) return null
  const { handle, name } = me.provisional
  if (!handle && !name) return null
  return (
    // Lus à leur tour (role « status ») : là dès l'arrivée sur la page, ce ne sont pas des alertes.
    <Stack gap="sm" align="stretch">
      {handle ? (
        <Notice
          tone="info"
          message={t(($) => $.profile.provisional.bannerHandle, { handle: me.handle })}
          polite
        />
      ) : null}
      {name ? (
        <Notice
          tone="info"
          message={t(($) => $.profile.provisional.bannerName, { name: me.name })}
          polite
        />
      ) : null}
    </Stack>
  )
}
