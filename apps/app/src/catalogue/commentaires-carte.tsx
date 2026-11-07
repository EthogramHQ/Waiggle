// La section « Carte d'un commentaire » du catalogue (R5b, planches `R5b-Commentaires` et
// `R5b-Menu-Etats`) : la carte (ui/CommentCard.tsx) dans tous ses états. Le commentaire d'un autre
// membre, celui de l'auteur du projet (badge), le sien (fond gris), le visé (miel pâle), une
// réponse, une mention ; masqué (vu par l'auteur du projet, puis par celui qui l'a écrit), retiré
// pour son auteur ; les emplacements (supprimé, retiré, masqué, bloqué, indisponible) ; la carte
// compacte de l'aperçu ; une action en échec, avec ou sans lien ; les trois menus ouverts ; puis
// quelques états de nuit.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes y
// travaillent en même temps. Ses libellés d'exemple (un outil de développement, absent de l'appli
// publiée) sont écrits ici, en français et en anglais ; les textes de la carte sont ceux de l'appli.
import type { CommentReply, CommentState } from '@ruche/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type ActionMenuItem, ActionMenuList } from '../ui/ActionMenu'
import { CommentCard } from '../ui/CommentCard'
import type { RemovedBanner } from '../ui/RemovalNotice'
import { Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { ThemeProvider } from '../ui/theme/ThemeProvider'

const fr = {
  title: 'Carte d’un commentaire',
  intro:
    'Un commentaire de la feuille : la photo et le nom (un lien), le badge « Auteur », la date, « modifié », le texte, « Répondre » dessous et « … » à droite. Ses propres commentaires sur fond gris, le commentaire visé en miel pâle ; les emplacements sans nom, ni date, ni action ; la carte compacte de l’aperçu, un seul bouton.',
  other: 'Un autre membre, sur le projet d’un autre (« Signaler » seul)',
  author: 'L’auteur du projet : le badge, et « modifié »',
  mine: 'Le sien : fond gris, lu « Ton commentaire »',
  highlighted: 'Visé par une réponse : miel pâle',
  reply: 'Une réponse : photo plus petite',
  mention: 'Avec une mention',
  hiddenByYou: 'Masqué, vu par l’auteur du projet : « Démasquer »',
  unhiding: 'Masqué, « Démasquer » en route',
  hiddenByAuthor: 'Masqué, vu par celui qui l’a écrit',
  removed: 'Retiré par la modération, vu par son auteur',
  placeholders: 'Les emplacements : supprimé, retiré, masqué, bloqué, indisponible',
  compact: 'Compacte (l’aperçu) : un seul bouton, sans lien ni action',
  error: 'Une action en échec',
  errorAction: 'Une action en échec, avec son lien',
  menus: 'Les menus ouverts : le sien, sur son projet, ailleurs',
  night: 'De nuit : le sien, le visé, masqué',
  // Les exemples : des textes de membres, comme dans l'appli.
  bodyOther: 'Super idée, je l’ai testé ce matin avec ma fille : elle a adoré la partie quiz.',
  bodyAuthor: 'Merci à tous ! J’ai ajouté la recherche par ingrédient, dites-moi si ça marche.',
  bodyMine: 'Est-ce que ça marche aussi avec des photos prises en intérieur ?',
  bodyReply: 'Oui, j’ai essayé hier soir, la lumière de la cuisine suffit.',
  bodyMention: 'Merci @lea_moreau, et @papi_jean tu devrais essayer !',
  bodyHidden: 'Franchement, rien de nouveau là-dedans.',
  bodyRemoved: 'Un texte retiré par la modération.',
  removedTitle: 'Retiré par la modération',
  removedLine: 'Motif : contenu blessant. Tu peux contester cette décision depuis tes réglages.',
  modify: 'Modifier',
  remove: 'Supprimer',
  hide: 'Masquer',
  report: 'Signaler',
  failed: 'Le changement n’a pas pu être enregistré. Réessaie.',
  expired: 'Ta session a expiré.',
  signIn: 'Me reconnecter',
}

const en: typeof fr = {
  title: 'Comment card',
  intro:
    'A comment in the sheet: the photo and the name (a link), the “Author” badge, the date, “edited”, the text, “Reply” under it and “…” on the right. One’s own comments on grey, the targeted comment in pale honey; placeholders with no name, date nor action; the compact card of the preview, a single button.',
  other: 'Another member, on someone else’s project (“Report” only)',
  author: 'The project’s author: the badge, and “edited”',
  mine: 'One’s own: grey, read “Your comment”',
  highlighted: 'Targeted by a reply: pale honey',
  reply: 'A reply: a smaller photo',
  mention: 'With a mention',
  hiddenByYou: 'Hidden, seen by the project’s author: “Unhide”',
  unhiding: 'Hidden, “Unhide” on its way',
  hiddenByAuthor: 'Hidden, seen by the one who wrote it',
  removed: 'Removed by the moderation, seen by its author',
  placeholders: 'Placeholders: deleted, removed, hidden, blocked, unavailable',
  compact: 'Compact (the preview): one button, no link nor action',
  error: 'A failed action',
  errorAction: 'A failed action, with its link',
  menus: 'The open menus: one’s own, on one’s project, elsewhere',
  night: 'At night: one’s own, targeted, hidden',
  bodyOther: 'Great idea, I tried it this morning with my daughter: she loved the quiz part.',
  bodyAuthor: 'Thanks everyone! I added search by ingredient, tell me if it works.',
  bodyMine: 'Does it also work with photos taken indoors?',
  bodyReply: 'Yes, I tried last night, the kitchen light is enough.',
  bodyMention: 'Thanks @lea_moreau, and @papi_jean you should try!',
  bodyHidden: 'Honestly, nothing new in there.',
  bodyRemoved: 'A text removed by the moderation.',
  removedTitle: 'Removed by the moderation',
  removedLine: 'Reason: hurtful content. You can appeal this decision from your settings.',
  modify: 'Edit',
  remove: 'Delete',
  hide: 'Hide',
  report: 'Report',
  failed: 'The change could not be saved. Try again.',
  expired: 'Your session has expired.',
  signIn: 'Sign in again',
}

type Labels = typeof fr
const noop = () => {}
/** L'heure figée du catalogue : la date relative ne dépend pas du moment de la visite. */
const NOW = new Date('2026-11-05T12:00:00.000Z')
const HOURS_AGO = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

const LEA = { id: 'lea', name: 'Léa Moreau', avatarUrl: null, handle: 'lea_moreau' }
const HUGO = { id: 'hugo', name: 'Hugo Lefèvre', avatarUrl: null, handle: 'hugo_l' }
const SAM = { id: 'sam', name: 'Sam Bernard', avatarUrl: null, handle: 'sam_b' }

/** Un commentaire, tel que l'API le rend : visible par défaut, sans mention ni modification. */
const sample = (overrides: Partial<CommentReply> & { id: string }): CommentReply => ({
  author: HUGO,
  body: '',
  createdAt: HOURS_AGO(3),
  editedAt: null,
  state: 'visible',
  isMine: false,
  mentions: [],
  removal: null,
  ...overrides,
})

/** Les props communes d'une carte d'exemple : ni menu, ni masquage, rien à ouvrir. */
const base = {
  kind: 'root' as const,
  isMine: false,
  isProjectAuthor: false,
  menu: [] as ActionMenuItem[],
  hiddenNote: null,
  onAuthorPress: noop,
  onMemberPress: noop,
  now: NOW,
}

/** Un exemple légendé, sur la surface de la feuille. */
function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Text variant="micro" tone="muted">
        {caption}
      </Text>
      <Surface variant="panel" padding="md" gap="sm">
        {children}
      </Surface>
    </Stack>
  )
}

/** Les trois menus d'une carte, selon qui regarde (scénario R5b, « Le menu « … » »). */
const menus = (l: Labels) => ({
  mine: [
    { label: l.modify, icon: 'pencil-simple', onPress: noop },
    { label: l.remove, icon: 'trash', tone: 'danger', onPress: noop },
  ] satisfies ActionMenuItem[],
  projectAuthor: [
    { label: l.hide, icon: 'eye-slash', onPress: noop },
    { label: l.report, icon: 'flag', onPress: noop },
  ] satisfies ActionMenuItem[],
  elsewhere: [{ label: l.report, icon: 'flag', onPress: noop }] satisfies ActionMenuItem[],
})

/** Les états de la carte, sur le thème qui l'entoure. */
function Cards({ l, only }: { l: Labels; only?: 'night' }) {
  const menu = menus(l)
  const removed: RemovedBanner = { title: l.removedTitle, lines: [l.removedLine] }
  const mine = (
    <Example caption={l.mine}>
      <CommentCard
        {...base}
        comment={sample({ id: 'mine', author: SAM, body: l.bodyMine, isMine: true })}
        isMine
        menu={menu.mine}
        onReply={noop}
      />
    </Example>
  )
  const highlighted = (
    <Example caption={l.highlighted}>
      <CommentCard
        {...base}
        comment={sample({ id: 'target', author: LEA, body: l.bodyOther })}
        highlighted
        menu={menu.elsewhere}
        onReply={noop}
      />
    </Example>
  )
  const hiddenByYou = (
    <Example caption={l.hiddenByYou}>
      <CommentCard
        {...base}
        comment={sample({ id: 'hidden', body: l.bodyHidden, state: 'hidden' })}
        menu={menu.projectAuthor}
        hiddenNote="byYou"
        onUnhide={noop}
      />
    </Example>
  )
  if (only === 'night')
    return (
      <>
        {mine}
        {highlighted}
        {hiddenByYou}
      </>
    )

  const placeholders: Exclude<CommentState, 'visible'>[] = [
    'deleted',
    'removed',
    'hidden',
    'blocked',
    'unavailable',
  ]
  return [
    <Example key="other" caption={l.other}>
      <CommentCard
        {...base}
        comment={sample({ id: 'other', author: LEA, body: l.bodyOther })}
        menu={menu.elsewhere}
        onReply={noop}
      />
    </Example>,
    <Example key="author" caption={l.author}>
      <CommentCard
        {...base}
        comment={sample({
          id: 'author',
          author: LEA,
          body: l.bodyAuthor,
          editedAt: HOURS_AGO(1),
        })}
        isProjectAuthor
        menu={menu.elsewhere}
        onReply={noop}
      />
    </Example>,
    <Stack key="mine">{mine}</Stack>,
    <Stack key="highlighted">{highlighted}</Stack>,
    <Example key="reply" caption={l.reply}>
      <CommentCard
        {...base}
        kind="reply"
        comment={sample({ id: 'reply', author: SAM, body: l.bodyReply, createdAt: HOURS_AGO(26) })}
        menu={menu.elsewhere}
        onReply={noop}
      />
    </Example>,
    <Example key="mention" caption={l.mention}>
      <CommentCard
        {...base}
        comment={sample({
          id: 'mention',
          body: l.bodyMention,
          mentions: [{ handle: 'lea_moreau', memberId: 'lea', name: 'Léa Moreau' }],
        })}
        menu={menu.elsewhere}
        onReply={noop}
      />
    </Example>,
    <Stack key="hiddenByYou">{hiddenByYou}</Stack>,
    <Example key="unhiding" caption={l.unhiding}>
      <CommentCard
        {...base}
        comment={sample({ id: 'unhiding', body: l.bodyHidden, state: 'hidden' })}
        menu={menu.projectAuthor}
        hiddenNote="byYou"
        onUnhide={noop}
        unhiding
      />
    </Example>,
    <Example key="hiddenByAuthor" caption={l.hiddenByAuthor}>
      <CommentCard
        {...base}
        comment={sample({
          id: 'hidden-mine',
          author: SAM,
          body: l.bodyHidden,
          state: 'hidden',
          isMine: true,
        })}
        isMine
        menu={menu.mine}
        hiddenNote="byProjectAuthor"
      />
    </Example>,
    <Example key="removed" caption={l.removed}>
      <CommentCard
        {...base}
        comment={sample({ id: 'removed', author: SAM, body: l.bodyRemoved, state: 'removed' })}
        isMine
        menu={[{ label: l.remove, icon: 'trash', tone: 'danger', onPress: noop }]}
        removed={removed}
      />
    </Example>,
    <Example key="placeholders" caption={l.placeholders}>
      {placeholders.map((state) => (
        <CommentCard key={state} {...base} comment={sample({ id: state, author: null, state })} />
      ))}
    </Example>,
    <Example key="compact" caption={l.compact}>
      <CommentCard
        {...base}
        compact
        onPress={noop}
        comment={sample({ id: 'compact-author', author: LEA, body: l.bodyAuthor })}
        isProjectAuthor
      />
      <CommentCard
        {...base}
        compact
        onPress={noop}
        comment={sample({
          id: 'compact-mention',
          body: l.bodyMention,
          mentions: [{ handle: 'lea_moreau', memberId: 'lea', name: 'Léa Moreau' }],
        })}
      />
      <CommentCard
        {...base}
        compact
        onPress={noop}
        comment={sample({ id: 'compact-mine', author: SAM, body: l.bodyMine, isMine: true })}
        isMine
      />
    </Example>,
    <Example key="error" caption={l.error}>
      <CommentCard
        {...base}
        comment={sample({ id: 'error', author: LEA, body: l.bodyOther })}
        menu={menu.elsewhere}
        onReply={noop}
        error={l.failed}
      />
    </Example>,
    <Example key="errorAction" caption={l.errorAction}>
      <CommentCard
        {...base}
        comment={sample({ id: 'error-action', author: LEA, body: l.bodyOther })}
        menu={menu.elsewhere}
        onReply={noop}
        error={l.expired}
        errorAction={{ label: l.signIn, onPress: noop }}
      />
    </Example>,
  ]
}

export function CommentCardCatalogue() {
  const { i18n, t } = useTranslation()
  const l: Labels = i18n.language === 'en' ? en : fr
  const menu = menus(l)
  const name = (who: string) => t(($) => $.project.comments.menu, { name: who })
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>
      <Cards l={l} />
      {/* Les menus, ouverts sans couche par-dessus la page : tels qu'ils flottent sous « … ». */}
      <Text variant="micro" tone="muted">
        {l.menus}
      </Text>
      <Stack direction="row" gap="md" wrap>
        <ActionMenuList label={name('Sam Bernard')} items={menu.mine} onChoose={noop} />
        <ActionMenuList label={name('Hugo Lefèvre')} items={menu.projectAuthor} onChoose={noop} />
        <ActionMenuList label={name('Léa Moreau')} items={menu.elsewhere} onChoose={noop} />
      </Stack>
      {/* De nuit : le fond gris, le miel pâle et la pastille du masqué sur la carte sombre. */}
      <ThemeProvider appearance="night">
        <Surface padding="md" gap="md">
          <Text variant="micro" tone="muted">
            {l.night}
          </Text>
          <Cards l={l} only="night" />
        </Surface>
      </ThemeProvider>
    </Stack>
  )
}
