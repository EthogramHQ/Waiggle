// L'en-tête de la page d'un outil (tranche R6b, planches `R6-Outil` et `R6-Outil-Desktop`) : son nom
// en très grand, qui est le titre de la page, la tuile à son initiale, « 34 projets · Sans code »,
// sa description, qui a écrit cette description, et l'adresse de son site.
//
// Ce que le composant garantit :
// - le nom est le titre de niveau 1 (`Text heading={1}`), en rôle de lettres `toolName` sur
//   téléphone et `toolNameWide` sur ordinateur ; `Text` le fait tenir sur une ligne (il rétrécit
//   plutôt que de se couper au milieu d'un mot) ;
// - la tuile décore (`InitialTile` est cachée aux lecteurs d'écran : le titre dit déjà le nom) ;
// - le lien du site est nommé par son hôte et dit qu'il passe par la page d'avertissement « Tu
//   quittes Waiggle » (`tool.siteLink`) ; il ne s'ouvre pas lui-même : `onPress` de l'écran montre
//   d'abord cette page ; Entrée l'ouvre sur le web ; zone à toucher de 44 points.
//
// Les textes arrivent déjà traduits : l'écran sait le nombre de projets, la famille et la langue de
// la description. Seul le nom lu du lien est composé ici, car il dépend de l'hôte.
import { readableWidth, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Icon } from './Icon'
import { InitialTile } from './InitialTile'
import { Pressed } from './Pressed'
import { Stack } from './Stack'
import { Text } from './Text'

type Props = {
  /** Le nom de l'outil (« Lovable ») : le titre de la page. */
  name: string
  /** Le nombre de projets, déjà écrit (« 34 projets »). */
  projects: string
  /** La famille de l'outil, déjà écrite (« Sans code »). */
  family: string
  /** Sa description dans la langue du visiteur ; `null` : l'outil n'en a pas, rien ne s'affiche. */
  description: string | null
  /**
   * « Description écrite par Waiggle, sans lien avec l'éditeur de l'outil » (jur-T7), sous la
   * description ; sans description, elle ne s'affiche pas.
   */
  disclaimer: string
  /**
   * Son site : l'hôte à afficher (« lovable.dev ») et l'ouverture, qui passe par la page de sortie
   * (déjà gardée contre la double tape par l'écran). `null` : pas de site, pas de lien.
   */
  site: { host: string; onPress: () => void } | null
  /** `phone` : nom de 64 points ; `wide` (ordinateur) : nom de 100 points. */
  layout: 'phone' | 'wide'
}

export function ToolHeader({
  name,
  projects,
  family,
  description,
  disclaimer,
  site,
  layout,
}: Props) {
  const { t } = useTranslation()
  return (
    <Stack gap="lg" align="stretch">
      {/* La tuile à côté du nom. Le nom, seul élément qui rétrécit, garde minWidth 0 : sans lui, un
          nom long garderait sa largeur entière et sortirait du cadre. */}
      <Stack direction="row" gap="md" align="center">
        <InitialTile name={name} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant={layout === 'wide' ? 'toolNameWide' : 'toolName'} heading={1}>
            {name}
          </Text>
        </View>
      </Stack>
      <Stack gap="sm" align="stretch">
        <Text variant="callout" tone="muted" weight={600}>
          {`${projects} · ${family}`}
        </Text>
        {description === null ? null : (
          <>
            <View style={{ maxWidth: readableWidth, alignSelf: 'stretch' }}>
              <Text tone="secondary">{description}</Text>
            </View>
            {/* Qui a écrit la description : en discret, mais toujours sous elle (relecture
                juridique). Sans description, rien : la phrase parlerait d'un texte absent
                (relectures de R6b, juridique S6). */}
            <View style={{ maxWidth: readableWidth, alignSelf: 'stretch' }}>
              <Text variant="caption" tone="muted">
                {disclaimer}
              </Text>
            </View>
          </>
        )}
      </Stack>
      {site === null ? null : (
        // À gauche, à la largeur de son contenu : le lien ne s'étire pas sur la page.
        <View style={{ alignSelf: 'flex-start' }}>
          <Pressed
            label={t(($) => $.tool.siteLink, { host: site.host })}
            onPress={site.onPress}
            role="link"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
              <Text variant="callout" weight={700} underline breakAnywhere>
                {site.host}
              </Text>
              {/* La flèche décore : le nom lu dit déjà que le lien passe par une page de sortie. */}
              <View aria-hidden>
                <Icon name="arrow-up-right" size={14} />
              </View>
            </View>
          </Pressed>
        </View>
      )}
    </Stack>
  )
}
