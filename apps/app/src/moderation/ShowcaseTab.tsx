// L'onglet « Vitrine de l'accueil » de la page Modération (tranche R12, planche R12-Vitrine ; plan
// R12, choix 10 et décision 18 ; docs/scenarios/refonte.md, « La vitrine »). La modération choisit
// les projets publics que tout le monde voit sur l'accueil, et que les membres voient dans « À la
// une », en tête d'Explorer.
//
// - « Sur l'accueil » et son compte (« 3 sur 4 ») : les projets mis en avant, dans l'ordre de leurs
//   places, chacun avec « Retirer » ; une place en pointillés pour chaque place libre. Un projet
//   modifié depuis son entrée le dit (« Modifié depuis la mise en avant », décision 18) : la
//   modération l'a choisi tel qu'il était, elle peut vouloir le revoir.
// - « Projets publics » : les projets publics qui n'y sont pas (les 20 plus récents, que donne
//   l'API), une recherche par titre parmi eux, et « Mettre en avant » sur chacun.
// - Un ajout prend la dernière place ; un retrait garde l'ordre des autres. Chaque geste renvoie la
//   vitrine entière à l'API (PUT de la liste, `moderation/showcase-api.ts`). Il n'y a pas de
//   commande « Monter » ou « Descendre » : pour changer l'ordre, on retire puis on remet.
// - Quatre projets au plus : vitrine pleine, « L'accueil est plein… », et « Mettre en avant »
//   devient inactif ; rien n'est envoyé.
// - Le refus de l'auteur (juridique 6, décision 18) : un auteur peut retirer son projet de
//   l'accueil, et l'API refuse ensuite de l'y remettre (409 `author_declined`). L'onglet le dit
//   d'avance, sur la ligne du projet (dont le bouton reste inactif), et après un refus de l'API.
//
// Deux règles de la charte du design, pour que rien ne bouge sous le doigt :
// - une ligne mise en avant reste à sa place dans la liste, avec « Sur l'accueil » à la place de son
//   bouton, jusqu'à ce qu'on quitte l'onglet : la ligne d'en dessous ne remonte pas sous le doigt ;
// - de même, la place d'un projet retiré reste dans la vitrine, sa carte comprise, avec « Retiré de
//   l'accueil » à la place de « Retirer », jusqu'à ce qu'on quitte l'onglet (relecture de design
//   R12, point 1) : la carte suivante ne glisse pas à sa place, et une seconde tape, même après la
//   garde, ne retire pas la voisine ;
// - un appui arrivé moins de 600 ms après un geste est ignoré : une double tape très rapide ne
//   lance pas deux gestes.
import { type ModerationShowcase, SHOWCASE_MAX, type ShowcaseCandidate } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ApiResult, errorKey } from '../api/errors'
import { useMediaSources } from '../api/media'
import { shortDate } from '../projects/format'
import { Button } from '../ui/Button'
import { type Focusable, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { ProjectThumb } from '../ui/ProjectThumb'
import { SearchField } from '../ui/SearchField'
import { ShowcaseCard } from '../ui/ShowcaseCard'
import { ShowcaseFreeSlot, ShowcaseSlot } from '../ui/ShowcaseSlot'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Text } from '../ui/Text'
import { useModerationShowcase, useSetShowcase } from './showcase-api'

/** Le temps de voir ce qui vient de changer : un appui arrivé avant est ignoré (charte, 6c). */
const SETTLE_MS = 600

type Item = ModerationShowcase['items'][number]
type Project = Item['project']

/**
 * Le titre ramené à une forme simple pour la recherche : en minuscules, sans accents (« décoll »
 * trouve « Décollage ! », et « decoll » aussi).
 */
const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

export function ShowcaseTab() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const showcase = useModerationShowcase()
  const { save } = useSetShowcase()
  const toSource = useMediaSources()

  const [query, setQuery] = useState('')
  // La dernière écriture refusée : sa phrase reste jusqu'à la réponse de l'écriture suivante (charte
  // du design : elle ne disparaît pas pendant l'envoi, sinon ce qui est dessous saute).
  const [failure, setFailure] = useState<string | null>(null)
  // « Réessayer » sur une vitrine en erreur : l'erreur reste affichée jusqu'à la réponse.
  const [retrying, setRetrying] = useState(false)
  // Les projets mis en avant pendant cette visite de l'onglet, avec leur ligne : elle reste à sa
  // place dans la liste (voir l'en-tête), même après la relecture qui l'a ôtée des candidats.
  const [featuredHere, setFeaturedHere] = useState<ReadonlyMap<string, ShowcaseCandidate>>(
    () => new Map(),
  )
  // Les projets retirés pendant cette visite, avec leur place : elle reste dans la vitrine (voir
  // l'en-tête), même après la relecture qui les a rendus aux candidats.
  const [removedHere, setRemovedHere] = useState<ReadonlyMap<string, Item>>(() => new Map())
  // L'ordre des lignes au dernier affichage : une ligne gardée y retrouve son rang.
  const shownOrder = useRef<readonly string[]>([])
  // L'ordre des places de la vitrine au dernier affichage : une place retirée y garde son rang.
  const shownSlots = useRef<readonly string[]>([])
  // L'heure du dernier geste, lue au moment de l'appui, sans attendre que l'écran se redessine.
  const lastGesture = useRef(0)
  // Le titre « Sur l'accueil » : le focus y va après un geste, le bouton touché ayant disparu.
  const titleRef = useRef<Focusable>(null)

  const data = showcase.data
  const items = data?.items ?? []
  const onShowcase = items.map((item) => item.project.id)
  const full = onShowcase.length >= SHOWCASE_MAX

  // Les lignes connues : celles mises en avant ici, puis celles que l'API propose (sa version gagne).
  const known = new Map<string, ShowcaseCandidate>(featuredHere)
  for (const candidate of data?.candidates ?? []) known.set(candidate.project.id, candidate)
  // Les lignes déjà montrées gardent leur rang ; les nouvelles viennent après, dans l'ordre de l'API.
  const kept = shownOrder.current.filter((id) => known.has(id))
  const order = [
    ...kept,
    ...(data?.candidates ?? [])
      .map((candidate) => candidate.project.id)
      .filter((id) => !kept.includes(id)),
  ]
  // Les places de la vitrine : celles retirées ici, puis celles de l'API (sa version gagne). Les
  // places déjà montrées gardent leur rang ; les nouvelles (un ajout) viennent à la fin.
  const slotItems = new Map<string, Item>(removedHere)
  for (const item of items) slotItems.set(item.project.id, item)
  const keptSlots = shownSlots.current.filter((id) => slotItems.has(id))
  const slotOrder = [...keptSlots, ...onShowcase.filter((id) => !keptSlots.includes(id))]
  useEffect(() => {
    shownOrder.current = order
    shownSlots.current = slotOrder
  })

  if (!data) {
    if (showcase.isError || retrying) {
      return (
        <StateMessage
          kind="error"
          level={2}
          title={t(($) => $.moderation.showcase.errorTitle)}
          message={t(($) => $.errors[errorKey(showcase.error)])}
          actions={[
            {
              label: t(($) => $.common.retry),
              loading: retrying,
              onPress: async () => {
                setRetrying(true)
                await showcase.refetch()
                setRetrying(false)
              },
            },
          ]}
        />
      )
    }
    return <StateMessage kind="loading" message={t(($) => $.common.loading)} />
  }

  /** Un appui sur un geste, ignoré juste après le précédent (double tape). */
  const settled = () => {
    if (Date.now() - lastGesture.current < SETTLE_MS) return false
    lastGesture.current = Date.now()
    return true
  }

  /** Après un geste, le focus va au titre de la vitrine : le bouton touché a disparu. */
  const focusTitle = () =>
    requestAnimationFrame(() => {
      focusWithoutScroll(titleRef.current)
      moveReaderTo(titleRef.current)
    })

  /** La réponse d'une écriture : refusée, l'onglet dit pourquoi ; réussie, la phrase part. */
  const answered = (result: ApiResult<null>) => {
    if (result.ok) setFailure(null)
    else if (result.error === 'authorDeclined') setFailure(t(($) => $.errors.authorDeclined))
    else setFailure(t(($) => $.moderation.showcase.error))
  }

  /** « Mettre en avant » : le projet entre à la dernière place. */
  const feature = async (candidate: ShowcaseCandidate) => {
    const id = candidate.project.id
    if (full || onShowcase.includes(id) || candidate.showcaseDeclinedAt) return
    if (!settled()) return
    setFeaturedHere((previous) => new Map(previous).set(id, candidate))
    // Remis après avoir été retiré pendant cette visite : il prend la dernière place, comme dans la
    // vitrine que l'API garde, et non l'ancienne place restée en attente.
    if (removedHere.has(id)) {
      setRemovedHere((previous) => {
        const next = new Map(previous)
        next.delete(id)
        return next
      })
      shownSlots.current = shownSlots.current.filter((one) => one !== id)
    }
    focusTitle()
    answered(await save([...onShowcase, id]))
  }

  /**
   * « Retirer » : le projet quitte la vitrine, les autres gardent leur ordre. Sa place reste, avec le
   * résultat à la place du bouton ; sur le web, `ShowcaseSlot` donne le focus du clavier au résultat
   * (le bouton touché a disparu). Refusé, le projet revient avec son bouton, et le focus va au titre.
   */
  const remove = async (item: Item) => {
    if (!settled()) return
    const id = item.project.id
    setRemovedHere((previous) => new Map(previous).set(id, item))
    const result = await save(onShowcase.filter((one) => one !== id))
    answered(result)
    if (!result.ok) focusTitle()
  }

  /** La photo d'un projet, pour sa carte ou sa vignette ; null : la lumière miel. */
  const coverOf = (project: Project) =>
    project.cover
      ? {
          source: toSource(project.cover.url),
          thumbhash: project.cover.thumbhash,
          label: project.title,
        }
      : null

  const statusOf = (project: Project) => t(($) => $.project.status[project.status])

  // --- La vitrine ---

  const slots = (
    <Row gap="md" align="start" wrap>
      {slotOrder.map((id) => {
        const item = slotItems.get(id)
        if (!item) return null
        const { project, editedSinceAdded } = item
        return (
          <ShowcaseSlot
            key={project.id}
            // Retiré pendant cette visite, et toujours hors de la vitrine (un refus de l'API le remet).
            removed={
              !onShowcase.includes(project.id) ? t(($) => $.moderation.showcase.removed) : null
            }
            card={
              <ShowcaseCard
                title={project.title}
                author={{ name: project.author.name, avatar: null }}
                image={coverOf(project)}
                status={{ label: statusOf(project), strong: project.status === 'testable' }}
                onPress={() => router.push(`/projects/${encodeURIComponent(project.id)}`)}
              />
            }
            note={editedSinceAdded ? t(($) => $.moderation.showcase.changed) : undefined}
            remove={{
              label: t(($) => $.moderation.showcase.remove),
              spokenLabel: t(($) => $.moderation.showcase.removeNamed, { title: project.title }),
              onPress: () => void remove(item),
            }}
          />
        )
      })}
      {/* Les places libres complètent les places montrées : une place retirée compte encore, et la
          rangée garde sa forme jusqu'au changement de vue. */}
      {Array.from({ length: Math.max(0, SHOWCASE_MAX - slotOrder.length) }, (_, index) => (
        // Les places libres n'ont pas d'identité : leur rang suffit.
        // biome-ignore lint/suspicious/noArrayIndexKey: une place libre n'a que son rang.
        <ShowcaseFreeSlot key={index} label={t(($) => $.moderation.showcase.freeSlot)} />
      ))}
    </Row>
  )

  // --- Les projets publics ---

  const wanted = folded(query.trim())
  const rows = order
    .map((id) => known.get(id))
    .filter((candidate): candidate is ShowcaseCandidate => candidate !== undefined)
    .filter((candidate) => folded(candidate.project.title).includes(wanted))

  const candidateRow = (candidate: ShowcaseCandidate) => {
    const { project } = candidate
    const declined = candidate.showcaseDeclinedAt !== null
    // Mise en avant ici et toujours dans la vitrine : la ligne le dit, à la place du bouton.
    const featured = featuredHere.has(project.id) && onShowcase.includes(project.id)
    const declinedId = `showcase-declined-${project.id}`
    const byline = t(($) => $.moderation.showcase.byline, {
      name: project.author.name,
      date: shortDate(candidate.publishedAt, i18n.language),
    })
    return (
      <ListRow
        key={project.id}
        label={project.title}
        leading={<ProjectThumb image={coverOf(project)} size="row" />}
        detail={
          declined ? (
            <Stack gap="xs">
              <Text variant="callout" tone="muted">
                {byline}
              </Text>
              <Text variant="callout" weight={600} tone="secondary" nativeID={declinedId}>
                {t(($) => $.errors.authorDeclined)}
              </Text>
            </Stack>
          ) : (
            byline
          )
        }
        accessory={
          <Row gap="sm" align="center" wrap>
            <StatusPill label={statusOf(project)} strong={project.status === 'testable'} />
            {featured ? (
              <StatusPill label={t(($) => $.moderation.showcase.title)} strong />
            ) : (
              <Button
                label={t(($) => $.moderation.showcase.feature)}
                spokenLabel={t(($) => $.moderation.showcase.featureNamed, {
                  title: project.title,
                })}
                icon="star"
                variant="secondary"
                size="compact"
                disabled={full || declined}
                // Inactif à cause du refus de l'auteur : il reste une étape de Tab, et dit pourquoi.
                focusableWhenDisabled={declined}
                describedById={declined ? declinedId : undefined}
                hint={declined ? t(($) => $.errors.authorDeclined) : undefined}
                onPress={() => void feature(candidate)}
              />
            )}
          </Row>
        }
      />
    )
  }

  const candidatesBody =
    rows.length > 0 ? (
      <ListGroup>{rows.map(candidateRow)}</ListGroup>
    ) : (
      <Text variant="callout" tone="secondary">
        {wanted
          ? t(($) => $.moderation.showcase.searchEmpty)
          : t(($) => $.moderation.showcase.empty)}
      </Text>
    )

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Row gap="sm" align="center" wrap>
          <Text variant="title2" heading={2} focusRef={titleRef}>
            {t(($) => $.moderation.showcase.title)}
          </Text>
          <StatusPill
            label={t(($) => $.moderation.showcase.count, {
              count: items.length,
              max: SHOWCASE_MAX,
            })}
            strong
          />
        </Row>
        {slots}
        {failure ? <Notice message={failure} /> : null}
      </Stack>
      <Stack gap="md">
        <Text variant="title2" heading={2}>
          {t(($) => $.moderation.showcase.candidates)}
        </Text>
        <SearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          label={t(($) => $.moderation.showcase.search)}
          placeholder={t(($) => $.moderation.showcase.search)}
        />
        {full ? <Notice tone="info" message={t(($) => $.moderation.showcase.full)} /> : null}
        {candidatesBody}
        <Text variant="caption" tone="secondary">
          {t(($) => $.moderation.showcase.limit, { max: SHOWCASE_MAX })}
        </Text>
      </Stack>
    </Stack>
  )
}
