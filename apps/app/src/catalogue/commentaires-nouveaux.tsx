// La section « Nouveaux commentaires (R21) » du catalogue : le bouton qui paraît quand des
// commentaires arrivent hors de vue pendant que le membre lit plus haut (`NewCommentsButton`), dans
// ses états : 1 (le singulier), plusieurs, un nombre long, un libellé qui passe à la ligne (le texte
// agrandi), 0 (rien, aucune place prise). Puis sa place : posé en bas d'une liste de commentaires
// par la place flottante de `Screen` (`ScreenFloating`), il couvre la liste sans la pousser.
// La section suit le thème du catalogue (pas de jour et de nuit imposés) : c'est la planche R21, prise
// de jour et de nuit, sur téléphone et sur ordinateur.
// Fichier à part de CatalogueScreen.tsx, qui l'importe en une ligne : plusieurs personnes écrivent
// le catalogue en même temps. Ses exemples, un outil de développement absent de l'appli publiée,
// sont écrits ici en français et en anglais.
import { radii, space } from '@ruche/brand'
import type { CommentReply } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../ui/Button'
import { CommentCard } from '../ui/CommentCard'
import { FloatingClearanceContext } from '../ui/floatingSpace'
import { DROP_SIZE, HoneyDrop } from '../ui/HoneyDrop'
import { NewCommentsButton } from '../ui/NewCommentsButton'
import { ScreenFloating } from '../ui/Screen'
import { SheetPanel } from '../ui/Sheet'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { useTheme } from '../ui/theme/ThemeProvider'

// Les espaces de la typographie française : insécable (U+00A0) avant « : » et dans « », fine
// (U+202F) avant « ? », « ! » et « ; ».
const fr = {
  title: 'Nouveaux commentaires (R21)',
  intro:
    'Un commentaire arrive pendant qu’on lit plus haut : la liste ne bouge pas, ce bouton paraît, et le toucher amène aux nouveaux. En verre, 44 points de haut ; l’arrivée est annoncée une fois au lecteur d’écran, sans prendre le focus.',
  states: 'Un, plusieurs, un nombre long.',
  wrap: 'Dans une colonne étroite, ou avec le texte agrandi : le libellé passe à la ligne, sans sortir du bouton. (Le vrai texte agrandi : agrandir le texte du navigateur, essai texte-200.)',
  none: 'À 0 : rien, et aucune place prise entre ces deux lignes.',
  before: 'Ligne au-dessus.',
  after: 'Ligne en dessous.',
  inList:
    'Sa place : en bas de l’écran, au-dessus de la liste qui continue dessous (la place flottante de Screen). Rien ne se décale.',
  firstText: 'Super idée, je l’ai testé ce matin avec ma fille.',
  secondText: 'Oui, la lumière de la cuisine suffit, même le soir.',
  thirdText: 'Est-ce que ça marche aussi avec une photo prise de loin ?',
  inSheet:
    'Dans la feuille des commentaires (téléphone) : par-dessus le bas de la liste, juste au-dessus du champ (SheetPanel floating). La liste garde sa hauteur.',
  sheetTitle: 'Commentaires',
  sheetSpoken: '6 commentaires',
  sheetField: 'Le champ « Écrire un commentaire », collé en bas.',
  over: 'Sur la page d’un projet (téléphone) : au-dessus de la capsule des réactions (over), hors de la hauteur réservée. La Goutte des Éclaireuses ne bouge pas, et le bouton passe au-dessus d’elle.',
  capsule: 'La capsule des réactions',
  drop: 'Faire un retour',
  activity:
    'Dans l’Activité ouverte : une notification arrive pendant la lecture, le bouton paraît en bas de l’écran (over), la flèche vers le haut, où sont les plus récentes. La liste ne bouge pas.',
}

const en: typeof fr = {
  title: 'New comments (R21)',
  intro:
    'A comment arrives while you read further up: the list stays still, this button appears, and touching it takes you to the new ones. Glass, 44 points high; the arrival is announced once to the screen reader, without taking the focus.',
  states: 'One, several, a long number.',
  wrap: 'In a narrow column, or with larger text: the label wraps, without leaving the button. (Real larger text: enlarge the browser text, texte-200 check.)',
  none: 'At 0: nothing, and no room taken between these two lines.',
  before: 'Line above.',
  after: 'Line below.',
  inList:
    'Its place: at the bottom of the screen, over the list that goes on underneath (the floating place of Screen). Nothing shifts.',
  firstText: 'Great idea, I tried it this morning with my daughter.',
  secondText: 'Yes, the kitchen light is enough, even in the evening.',
  thirdText: 'Does it also work with a photo taken from far away?',
  inSheet:
    'In the comments sheet (phone): over the bottom of the list, just above the field (SheetPanel floating). The list keeps its height.',
  sheetTitle: 'Comments',
  sheetSpoken: '6 comments',
  sheetField: 'The “Write a comment” field, pinned at the bottom.',
  over: 'On a project page (phone): above the reactions capsule (over), out of the reserved height. The scouts drop stays still, and the button goes above it.',
  capsule: 'The reactions capsule',
  drop: 'Give feedback',
  activity:
    'In the open Activity: a notification arrives while reading, the button appears at the bottom of the screen (over), the arrow pointing up, where the latest ones are. The list stays still.',
}

const noop = () => {}
/** L'heure figée du catalogue : la date relative ne dépend pas du moment de la visite. */
const NOW = new Date('2026-11-26T12:00:00.000Z')
const HOURS_AGO = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const member = (id: string, name: string, handle: string) => ({
  id,
  name,
  avatarUrl: null,
  handle,
  isTester: false,
})
const HUGO = member('hugo', 'Hugo Lefèvre', 'hugo_l')
const SAM = member('sam', 'Sam Bernard', 'sam_b')
const NORA = member('nora', 'Nora Benali', 'nora_b')

/** Un commentaire d'exemple, tel que l'API le rend. */
const sample = (id: string, author: typeof HUGO, body: string, hours: number): CommentReply => ({
  id,
  author,
  body,
  createdAt: HOURS_AGO(hours),
  editedAt: null,
  state: 'visible',
  isMine: false,
  mentions: [],
  removal: null,
})

/** Les props communes d'une carte d'exemple : ni menu, ni masquage, rien à ouvrir. */
const base = {
  kind: 'root' as const,
  isMine: false,
  isProjectAuthor: false,
  menu: [],
  hiddenNote: null,
  onAuthorPress: noop,
  onMemberPress: noop,
  now: NOW,
}

/**
 * Un bout d'écran de téléphone : trois commentaires, la liste coupée par le bas (elle continue
 * dessous), et le bouton posé en bas par la place flottante, comme `Screen` le fait.
 */
function CommentsFrame({ l }: { l: typeof fr }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height: 340,
        width: '100%',
        maxWidth: 560,
        overflow: 'hidden',
        borderRadius: radii.tile,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <CommentCard {...base} comment={sample('one', HUGO, l.firstText, 3)} />
          <CommentCard {...base} comment={sample('two', SAM, l.secondText, 2)} />
          <CommentCard {...base} comment={sample('three', NORA, l.thirdText, 1)} />
        </Stack>
      </View>
      <ScreenFloating lift={space.lg}>
        <NewCommentsButton count={1} onPress={noop} />
      </ScreenFloating>
    </View>
  )
}

/**
 * R21 : la feuille des commentaires (téléphone), défilée plus bas, avec le bouton posé par-dessus le
 * bas de sa liste, juste au-dessus du champ (`SheetPanel floating`). La liste garde sa hauteur.
 */
function SheetFrame({ l }: { l: typeof fr }) {
  return (
    <View style={{ height: 520, width: '100%', maxWidth: 430, alignSelf: 'center' }}>
      <SheetPanel
        title={l.sheetTitle}
        layout="phone"
        onClose={noop}
        titleCount={{ count: 6, spoken: l.sheetSpoken }}
        footer={
          <Text variant="callout" tone="secondary">
            {l.sheetField}
          </Text>
        }
        floating={<NewCommentsButton count={1} onPress={noop} announce={false} on="sheet" />}
      >
        <Stack gap="md">
          <CommentCard {...base} comment={sample('s-one', HUGO, l.firstText, 3)} />
          <CommentCard {...base} comment={sample('s-two', SAM, l.secondText, 2)} />
          <CommentCard {...base} comment={sample('s-three', NORA, l.thirdText, 1)} />
          <CommentCard {...base} comment={sample('s-four', HUGO, l.secondText, 1)} />
        </Stack>
      </SheetPanel>
    </View>
  )
}

/**
 * R21 : le bas d'un téléphone de 320 points sur la page d'un projet. La capsule (ici un bouton qui
 * en tient la place) dans la place flottante, la Goutte posée 8 points au-dessus d'elle, dans le
 * coin, et le bouton `over` qui passe au-dessus de la Goutte (ce que `Screen` donne par
 * `FloatingClearanceContext` : la Goutte, 56 points et son écart, dépasse de 64 la place).
 */
function OverCapsuleFrame({ l }: { l: typeof fr }) {
  const { colors } = useTheme()
  const capsule = 44
  return (
    <View
      style={{
        height: 260,
        width: 320,
        alignSelf: 'center',
        overflow: 'hidden',
        borderRadius: radii.tile,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{ position: 'absolute', right: space.lg, bottom: space.lg + capsule + space.sm }}
      >
        <HoneyDrop
          label={l.drop}
          folded={false}
          onPress={noop}
          onLongPress={noop}
          onUnfold={noop}
          inline
          still
        />
      </View>
      <ScreenFloating lift={space.lg}>
        <FloatingClearanceContext.Provider value={DROP_SIZE + space.sm}>
          <Stack gap="sm" align="center">
            <NewCommentsButton count={1} onPress={noop} over />
            <Button label={l.capsule} variant="glass" size="compact" onPress={noop} />
          </Stack>
        </FloatingClearanceContext.Provider>
      </ScreenFloating>
    </View>
  )
}

/** L'Activité ouverte (R21) : le bouton seul dans la place flottante, posé au-dessus d'elle (`over`). */
function ActivityFrame() {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height: 160,
        width: 320,
        alignSelf: 'center',
        overflow: 'hidden',
        borderRadius: radii.tile,
        backgroundColor: colors.background,
      }}
    >
      <ScreenFloating lift={space.lg}>
        <NewCommentsButton count={2} of="notifications" onPress={noop} over />
      </ScreenFloating>
    </View>
  )
}

export function NewCommentsCatalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {l.title}
      </Text>
      <Text tone="secondary">{l.intro}</Text>

      {/* Ses états : le singulier, le pluriel, un nombre à trois chiffres. Chaque bouton se centre
          dans sa largeur, comme dans la place flottante. */}
      <Text tone="secondary">{l.states}</Text>
      <NewCommentsButton count={1} onPress={noop} />
      <NewCommentsButton count={3} onPress={noop} />
      <NewCommentsButton count={128} onPress={noop} />

      {/* Une colonne de 230 points : le libellé passe à la ligne, comme avec le texte agrandi. */}
      <Text tone="secondary">{l.wrap}</Text>
      <View style={{ width: 230, alignSelf: 'center' }}>
        <NewCommentsButton count={12} onPress={noop} />
      </View>

      {/* À 0 : la place est hors du flux, l'écart entre les deux lignes reste celui de la pile. */}
      <Text tone="secondary">{l.none}</Text>
      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          {l.before}
        </Text>
        <NewCommentsButton count={0} onPress={noop} />
        <Text variant="caption" tone="muted">
          {l.after}
        </Text>
      </Stack>

      <Text tone="secondary">{l.inList}</Text>
      <CommentsFrame l={l} />

      <Text tone="secondary">{l.inSheet}</Text>
      <SheetFrame l={l} />

      <Text tone="secondary">{l.over}</Text>
      <OverCapsuleFrame l={l} />

      <Text tone="secondary">{l.activity}</Text>
      <ActivityFrame />
    </Stack>
  )
}
