// Le rayon d'un membre sur sa page (R19, docs/scenarios/refonte.md, « Le niveau et ton rayon » ;
// planches R19-Profil et R19-Membre), posé sous son en-tête par MemberScreen :
// - `MyHarvest`, sur sa propre page (« Moi ») : le titre « Ma récolte › » qui mène à la page de la
//   récolte, le niveau, le titre, le miel, le rayon, la phrase de pollen, les semaines butinées et
//   « Mes sceaux · N ». Le miel, la phrase et les semaines ne sont pas dans `Member.game` : ils
//   viennent de « Ma récolte » (GET /v1/me/harvest), lue ici seulement, pour soi. En attendant sa
//   réponse (ou si elle échoue), le panneau montre ce que la page du membre sait déjà ;
// - `TheirHarvest`, sur la page d'un proche (option a5) : son niveau, son titre, son rayon et « Ses
//   sceaux · N », jamais son miel, ni la phrase, ni ses semaines ; sa récolte n'est jamais lue.
//
// Le passage de niveau (option a10) : si la récolte dit un niveau pas encore vu (`levelSeen <
// level`), l'alvéole joue sa cire qui coule une fois, « Nouveau » s'affiche, et à la fin du
// mouvement l'écran écrit le niveau comme vu (PATCH /v1/me/game { levelSeen }). Ce qui est vu à
// l'arrivée est figé pour toute la visite : la relecture qui suit l'écriture ne retire pas
// « Nouveau » sous les yeux (relecture d'interface du plan, UI-4).
import { type EarnedSeal, type GameTitle, type MemberGame, SEALS } from '@ruche/contracts'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameSettings, useHarvest } from '../gamification/api'
import { HarvestPanel } from '../ui/HarvestPanel'
import { type IconName, iconPaths } from '../ui/icons.generated'
import { LevelCell } from '../ui/LevelCell'
import { SealShelf, type ShelfSeal } from '../ui/SealShelf'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

type Props = {
  /** Ce que la page du membre dit de son jeu (`Member.game`, jamais null ici). */
  game: MemberGame
  /** La colonne du profil sur ordinateur : les sceaux en grille au lieu d'une rangée qui défile. */
  column: boolean
}

/** L'icône d'un sceau est-elle dessinée ? (Une catégorie créée plus tard n'a pas d'icône connue.) */
const isIcon = (name: string): name is IconName => name in iconPaths

/** Le dessin d'un sceau par son code ; un sceau de catégorie créée ensuite prend l'alvéole. */
const sealDefinition = (code: string) => SEALS.find((seal) => seal.code === code)

/** Hook : le titre d'un membre, accordé à sa forme (« Gardienne », « Gardien »), ou undefined. */
function useTitleText(title: GameTitle | null): string | undefined {
  const { t } = useTranslation()
  if (!title) return undefined
  // La clé, recopiée dans une constante avant le sélecteur de texte (clé fabriquée).
  const key = `${title.family}_${title.form}` as const
  return t(($) => $.game.titles[key])
}

/** Hook : les sceaux gagnés, prêts pour l'étagère (dessin et nom traduit). */
function useShelfSeals(seals: EarnedSeal[]): ShelfSeal[] {
  const { t } = useTranslation()
  return seals.map((earned) => {
    const code = earned.code
    const known = sealDefinition(code)
    // Un sceau de palier a toujours un « _ » dans son code, une catégorie jamais (contrat).
    const name = known
      ? code.includes('_')
        ? t(($) => $.game.seals[code as keyof typeof $.game.seals & `${string}_${string}`])
        : t(($) => $.game.seals.category[code as keyof typeof $.game.seals.category])
      : t(($) => $.game.seals.categoryOther, { category: code })
    return {
      key: code,
      icon: known && isIcon(known.icon) ? known.icon : 'hexagon',
      matter: known?.matter ?? 'cream',
      name,
    }
  })
}

/** « Mes sceaux · 2 » ou « Ses sceaux · 2 », puis les sceaux ; rien sans aucun sceau. */
function Seals({ seals, mine, column }: { seals: EarnedSeal[]; mine: boolean; column: boolean }) {
  const { t } = useTranslation()
  const shelf = useShelfSeals(seals)
  if (shelf.length === 0) return null
  const count = shelf.length
  return (
    <Stack gap="sm">
      {/* Sur sa page, une partie de « Ma récolte » (niveau 3, sous son titre) ; sur celle d'un
          proche, une section de la page (niveau 2). */}
      <Text variant="headline" heading={mine ? 3 : 2}>
        {mine
          ? t(($) => $.game.harvest.seals.mine, { count })
          : t(($) => $.game.harvest.seals.theirs, { count })}
      </Text>
      <SealShelf seals={shelf} layout={column ? 'grid' : 'row'} />
    </Stack>
  )
}

/** Sa propre page : tout le panneau, avec ce que seule « Ma récolte » sait. */
export function MyHarvest({ game, column }: Props) {
  const harvest = useHarvest().data
  const settings = useGameSettings()
  // Le passage vu à l'arrivée de la récolte, figé pour la visite : `undefined` tant qu'elle n'est
  // pas là, `null` sans passage. Changer l'état pendant le dessin est permis par React pour suivre
  // une donnée qui arrive (une seule fois ici).
  const [risen, setRisen] = useState<{ from: number; level: number } | null | undefined>(undefined)
  if (harvest && risen === undefined)
    setRisen(
      harvest.levelSeen < harvest.level ? { from: harvest.levelSeen, level: harvest.level } : null,
    )
  // L'écriture du niveau vu, une fois par visite, même si l'alvéole prévenait deux fois.
  const marked = useRef(false)
  const markSeen = () => {
    if (!risen || marked.current) return
    marked.current = true
    settings.mutate({ levelSeen: risen.level })
  }

  const level = harvest?.level ?? game.level
  const title = useTitleText(harvest?.title ?? game.title)
  const decoration = harvest?.decoration ?? game.decoration

  return (
    <Stack gap="lg">
      <HarvestPanel
        href="/harvest"
        level={level}
        title={title}
        honey={harvest?.honey}
        cells={harvest?.cells ?? game.cells}
        toNext={harvest?.toNext}
        weeks={harvest ? harvest.weeks : undefined}
        newcomerHint={harvest ? harvest.weeks.count === 0 : false}
        isNew={Boolean(risen)}
        tint={decoration.tint}
        pattern={decoration.pattern}
        levelCell={
          <LevelCell
            level={level}
            size="regular"
            {...(risen ? { rise: { from: risen.from }, onRisen: markSeen } : null)}
          />
        }
      />
      <Seals seals={harvest?.seals ?? game.seals} mine column={column} />
    </Stack>
  )
}

/** La page d'un proche : son niveau, son titre, son rayon et ses sceaux, rien de plus. */
export function TheirHarvest({ game, column }: Props) {
  const title = useTitleText(game.title)
  return (
    <Stack gap="lg">
      <HarvestPanel
        theirs
        level={game.level}
        title={title}
        cells={game.cells}
        isNew={false}
        tint={game.decoration.tint}
        pattern={game.decoration.pattern}
        levelCell={<LevelCell level={game.level} size="regular" />}
      />
      <Seals seals={game.seals} mine={false} column={column} />
    </Stack>
  )
}
