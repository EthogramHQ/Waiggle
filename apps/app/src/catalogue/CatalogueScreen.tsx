// Le catalogue : tous les composants de l'interface, dans tous leurs états, sur une seule page.
// C'est notre « maquette vivante » : quand on change un jeton (packages/brand) ou un composant
// (src/ui), on voit ici tout de suite l'effet partout, de jour comme de nuit, en français comme en
// anglais. Les captures automatiques (scripts/shots.mjs) photographient aussi cette page.
//
// Outil de développement : il n'existe pas dans l'appli publiée (voir app/catalogue.tsx). Ses textes
// d'exemple sont donc écrits ici, et non dans les traductions des membres.
import {
  type ColorName,
  type FontWeight,
  palettes,
  radii,
  type TextVariant,
  textStyles,
} from '@ruche/brand'
import { COMMENT_MAX, PROJECT_NOTE_MAX, REACTION_KINDS, type ReactionKind } from '@ruche/contracts'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientLight } from '../ui/AmbientLight'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { CodeBlock } from '../ui/CodeBlock'
import { Columns } from '../ui/Columns'
import { CommentCard } from '../ui/CommentCard'
import { CommentList } from '../ui/CommentList'
import { CommentThread } from '../ui/CommentThread'
import { CountBadge } from '../ui/CountBadge'
import { Dialog } from '../ui/Dialog'
import { Disclosure } from '../ui/Disclosure'
import { FeedEnd } from '../ui/FeedEnd'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { Hint } from '../ui/Hint'
import { HoneyMeter } from '../ui/HoneyMeter'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { type IconName, iconPaths } from '../ui/icons.generated'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Markdown } from '../ui/Markdown'
import { MemberHeader } from '../ui/MemberHeader'
import { MentionField, type MentionSuggestion } from '../ui/MentionField'
import { MentionText } from '../ui/MentionText'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { NoteCard } from '../ui/NoteCard'
import { NoteComposer } from '../ui/NoteComposer'
import { NoteList } from '../ui/NoteList'
import { Notice } from '../ui/Notice'
import { NotificationCard } from '../ui/NotificationCard'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectCover } from '../ui/ProjectCover'
import { ProjectGrid } from '../ui/ProjectGrid'
import { ReactionBar } from '../ui/ReactionBar'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { SheetHeader } from '../ui/SheetHeader'
import { Row, Stack } from '../ui/Stack'
import { StateMessage } from '../ui/StateMessage'
import { StatusPill } from '../ui/StatusPill'
import { Step, StepNumber } from '../ui/StepNumber'
import { Surface } from '../ui/Surface'
import { Switch } from '../ui/Switch'
import { Tag } from '../ui/Tag'
import { TagInput } from '../ui/TagInput'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { Thumbnails } from '../ui/Thumbnails'
import type { Appearance } from '../ui/theme/appearance'
import { useTheme } from '../ui/theme/ThemeProvider'
import { VisualEditor } from '../ui/VisualEditor'
import { Wordmark } from '../ui/Wordmark'
import { ActionMenuSamples } from './actionMenu'
import { AmbiancesCatalogue } from './ambiances'
import { LoadingCatalogue } from './chargement'
import { AccountCatalogue } from './compte'
import { ControlsCatalogue } from './controles'
import { EntryCatalogue } from './entrer'
import { SheetsCatalogue } from './feuilles'
import { FeedEndCatalogue } from './fin-de-fil'
import { FormSamples } from './formulaire'
import { TokensCatalogue } from './jetons'
import { labels } from './labels'
import { LightCatalogue } from './lumiere'
import { BrandCatalogue } from './marque'
import { MascotCatalogue } from './mascotte'
import { MaterialsCatalogue } from './matieres'
import { ModerationCatalogue } from './moderation'
import { SettingsCatalogue } from './reglages'
import { ReportSamples } from './reports'
import { SuspensionCatalogue } from './suspension'

// Des résumés flous (ThumbHash) de deux visuels de projet, pour montrer la lumière d'ambiance.
// Ils ressemblent à des clés secrètes pour l'outil qui cherche les secrets oubliés (gitleaks) :
// le commentaire « gitleaks:allow » lui indique que ce n'en sont pas.
const samples = {
  cafe: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI', // gitleaks:allow
  papillon: 'GdkFJYTHYFSbVnaPWUZndpajf7QG', // gitleaks:allow
}

export function CatalogueScreen() {
  const { t, i18n } = useTranslation()
  const [dialog, setDialog] = useState(false)
  const [longDialog, setLongDialog] = useState(false)
  const { appearance, setAppearance } = useTheme()
  const l = labels[i18n.language === 'en' ? 'en' : 'fr']

  return (
    <Screen width="page">
      <Stack gap="md">
        <Wordmark size="large" />
        <Text variant="title2" heading={1}>
          {l.title}
        </Text>
        <Text tone="secondary">{l.intro}</Text>
      </Stack>

      <Surface variant="grouped" padding="lg" gap="md">
        <Segmented<Appearance>
          label={l.appearance}
          options={[
            { value: 'auto', label: l.auto, icon: 'circle-half' },
            { value: 'day', label: l.day, icon: 'sun' },
            { value: 'night', label: l.night, icon: 'moon' },
          ]}
          value={appearance}
          onChange={setAppearance}
        />
        <LanguageSwitcher />
      </Surface>

      <Section title={l.colors}>
        <Swatches />
      </Section>

      <Section title={l.type}>
        <TypeScale sample={l.sampleTitle} />
      </Section>

      <Section title={l.buttons}>
        <Columns
          main={
            <Stack gap="md">
              <Button label={l.publish} icon="plus" onPress={() => {}} />
              <Button label={l.secondary} variant="secondary" onPress={() => {}} />
              <Button label={l.delete} variant="danger" icon="trash" onPress={() => {}} />
              <Button label={l.confirmDelete} variant="confirm" onPress={() => {}} />
              <Button label={l.publish} disabled onPress={() => {}} />
              <Button label={l.publish} loading onPress={() => {}} />
            </Stack>
          }
          side={
            <OnLight thumbhash={samples.cafe}>
              <Stack direction="row" gap="sm" wrap>
                <IconButton icon="arrow-left" label={l.back} onPress={() => {}} />
                <IconButton icon="share-network" label={l.share} onPress={() => {}} />
                <IconButton icon="dots-three" label={l.more} onPress={() => {}} />
                <IconButton
                  icon="plus"
                  label={l.publish}
                  variant="honey"
                  size="large"
                  onPress={() => {}}
                />
              </Stack>
              <Button
                label={l.tryIt}
                variant="glass"
                icon="arrow-up-right"
                size="compact"
                onPress={() => {}}
              />
              {/* Un libellé trop long pour sa rangée passe à la ligne, sans sortir du bouton
                  (texte agrandi, écran étroit). */}
              <Stack direction="row" gap="sm">
                <Button
                  label={l.longButton}
                  variant="secondary"
                  icon="plus"
                  size="compact"
                  onPress={() => {}}
                />
              </Stack>
            </OnLight>
          }
        />
      </Section>

      <Section title={l.pills}>
        <Stack direction="row" gap="sm" wrap>
          <StatusPill label={l.statuses.idea} />
          <StatusPill label={l.statuses.building} />
          <StatusPill label={l.statuses.testable} strong />
          <StatusPill label={l.statuses.done} />
          <StatusPill label={l.statuses.paused} />
        </Stack>
        <Stack direction="row" gap="sm" wrap>
          <Tag label="Claude" onPress={() => {}} />
          <Tag label="Python" onPress={() => {}} />
          <Tag label="Expo" />
        </Stack>
      </Section>

      <Section title={l.fields}>
        <Fields l={l} />
      </Section>

      <Section title={l.choices}>
        <Choicesample l={l} />
      </Section>

      <Section title={l.messages}>
        <Notice message={l.errorMessage} />
        <Notice tone="info" message={l.infoMessage} />
        <Notice tone="success" message={l.successMessage} />
        {/* Avec une action : un lien sous le message (« Me reconnecter », tranche 6c). */}
        <Notice message={l.expired} action={{ label: l.signInAgain, onPress: () => {} }} />
        {/* Une information avec une action, lue sans couper le lecteur d'écran (polite). */}
        <Notice
          tone="info"
          polite
          message={l.infoMessage}
          action={{ label: l.infoAction, onPress: () => {} }}
        />
        {/* Deux messages du même groupe (`single`, comme deux actions refusées par une session
            expirée) : seul le premier arrivé s'affiche, et le second ne le remplace pas. */}
        <Notice
          message={l.expired}
          action={{ label: l.signInAgain, onPress: () => {}, single: 'catalogue' }}
        />
        <Notice
          message={l.expiredAgain}
          action={{ label: l.signInAgain, onPress: () => {}, single: 'catalogue' }}
        />
      </Section>

      <Section title={l.text}>
        <Surface padding="xl">
          <Markdown text={l.markdown} onLinkPress={() => {}} />
        </Surface>
        <CodeBlock>{l.prompt}</CodeBlock>
      </Section>

      <Section title={l.lists}>
        <ListGroup title={l.languageTitle} footer={l.languageHint} radio>
          <ListRow label="Français" selected onPress={() => {}} />
          <ListRow label="English" selected={false} onPress={() => {}} />
        </ListGroup>
        <ListGroup title={l.dataTitle}>
          <ListRow icon="user" label={l.profileRow} detail="Léa Moreau" />
          <ListRow label={l.download} trailing="download-simple" onPress={() => {}} />
          <ListRow label={l.signOut} trailing="sign-out" onPress={() => {}} />
          <ListRow label={l.deleteAccount} tone="danger" trailing="trash" onPress={() => {}} />
        </ListGroup>
        <EmailSwitches l={l} />
        {/* Une ligne qui attend (les réglages pas encore arrivés) : annoncée comme occupée. */}
        <ListGroup>
          <ListRow label={l.loadingRow} busy />
        </ListGroup>
        {/* Elle n'a pas pu se charger : la raison dessous, en alerte (detailAlert), et l'action. */}
        <ListGroup>
          <ListRow
            label={l.loadFailedRow}
            detail={l.loadFailedReason}
            detailAlert={0}
            accessory={
              <Button label={l.retry} variant="secondary" size="compact" onPress={() => {}} />
            }
          />
        </ListGroup>
      </Section>

      {/* Les états d'une page qui n'a pas (encore) son contenu : toujours une issue. */}
      <Section title={l.states}>
        {/* level={3} : ici, chaque état est un exemple rangé sous la section « États » (niveau 2).
            Dans l'appli, un état a le niveau 2, ou 1 quand il remplace toute la page. */}
        <StateMessage kind="loading" message={l.stateLoading} />
        <StateMessage
          kind="error"
          level={3}
          title={l.stateErrorTitle}
          message={l.stateError}
          actions={[
            { label: l.retry, onPress: () => {} },
            { label: l.goBack, onPress: () => {} },
          ]}
        />
        <StateMessage
          kind="notFound"
          level={3}
          title={l.stateNotFoundTitle}
          message={l.stateNotFound}
          actions={[{ label: l.home, onPress: () => {} }]}
        />
        <StateMessage
          kind="empty"
          level={3}
          title={l.stateEmptyTitle}
          message={l.stateEmpty}
          actions={[{ label: l.publish, onPress: () => {} }]}
        />
        <StateMessage
          kind="signedOut"
          level={3}
          title={l.stateSignedOutTitle}
          message={l.stateSignedOut}
          actions={[
            { label: l.signIn, onPress: () => {} },
            { label: l.signUp, onPress: () => {} },
          ]}
        />
      </Section>

      <Section title={l.forms}>
        <SheetHeader
          title={l.newProject}
          cancel={{ label: l.cancel, onPress: () => {} }}
          action={{ label: l.publish, onPress: () => {} }}
        />
        {/* Un titre long passe sur deux lignes ; « Annuler » et l'action restent entiers. S'il n'y
            a pas la place (petit écran, grand texte), le titre passe sous les deux boutons. */}
        <SheetHeader
          title={l.longSheetTitle}
          cancel={{ label: l.cancel, onPress: () => {} }}
          action={{ label: l.save, onPress: () => {} }}
        />
        {/* Un mot sans espace plus large que l'écran se coupe au lieu de déborder. */}
        <Text variant="title2" align="center" breakAnywhere>
          {l.longHost}
        </Text>
        <Tag label={l.longHost} onPress={() => {}} />
        <Button label={l.longHost} icon="arrow-up-right" onPress={() => {}} />
        <TagSample l={l} />
        <VisualEditorSample l={l} />
        {/* Sans photo : pas de rangée vide entre la consigne et le bouton. */}
        <VisualEditorSample l={l} empty />
        {/* La jauge vide (discrète), en cours, puis remplie. */}
        <HoneyMeter value={0} max={12} label={l.meterEmpty} />
        <HoneyMeter value={9} max={12} label={l.meter} />
        <HoneyMeter value={12} max={12} label={l.meterDone} />
        <Hint icon="lock-simple" text={l.stateSignedOut} />
        <Hint icon="globe-simple" text={l.longHint} />
        {/* Un morceau de la note est un lien (ici sans effet : le catalogue n'ouvre rien). */}
        <Hint
          icon="envelope-simple"
          text={l.hintLink}
          link={{ label: l.hintLinkLabel, onPress: () => undefined }}
        />
        <Disclosure title={l.recipe} hint={l.recipeHint}>
          <Text tone="secondary">{l.plain}</Text>
        </Disclosure>
        <Row gap="md" align="start">
          <StepNumber value={1} />
          <Stack grow>
            <Text>{l.step}</Text>
          </Stack>
        </Row>
        {/* Une étape complète : le numéro centré sur le bouton, la précision alignée dessous. */}
        <Step
          value={2}
          control={<Button label={l.download} variant="secondary" onPress={() => {}} />}
        >
          <Text variant="caption" tone="muted">
            {l.longHint}
          </Text>
        </Step>
        <Row gap="sm" wrap>
          <TextLink label={l.createAccount} onPress={() => {}} />
          <TextLink label={l.cancel} onPress={() => {}} role="button" />
        </Row>
        <Button label={l.openDialog} variant="secondary" onPress={() => setDialog(true)} />
        <Dialog
          visible={dialog}
          title={l.dialogTitle}
          message={l.dialogBody}
          onDismiss={() => setDialog(false)}
        >
          <Button label={l.confirmDelete} variant="confirm" onPress={() => setDialog(false)} />
          <Button label={l.cancel} variant="secondary" onPress={() => setDialog(false)} />
        </Dialog>
        {/* Un message en plusieurs paragraphes, alignés à gauche, et la garde des tapes (600 ms
            après l'ouverture) : la fenêtre « Bloquer @x ? » (tranche 7b), avec ses textes. */}
        <Button
          label={t(($) => $.block.title, { handle: 'max_durand' })}
          variant="secondary"
          onPress={() => setLongDialog(true)}
        />
        <Dialog
          visible={longDialog}
          title={t(($) => $.block.title, { handle: 'max_durand' })}
          message={[
            t(($) => $.block.hidden),
            t(($) => $.block.remains, { handle: 'max_durand' }),
            t(($) => $.block.follows),
            t(($) => $.block.notTold, { handle: 'max_durand' }),
            t(($) => $.block.notModeration),
          ]}
          guardTaps
          onDismiss={() => setLongDialog(false)}
        >
          <Button
            label={t(($) => $.block.confirm)}
            variant="confirm"
            onPress={() => setLongDialog(false)}
          />
          <Button
            label={t(($) => $.block.cancel)}
            variant="secondary"
            onPress={() => setLongDialog(false)}
          />
        </Dialog>
      </Section>

      <Section title={l.projects}>
        <Columns
          main={
            <Stack gap="md">
              <ProjectCover title={l.sampleTitle} height={260} />
              <ProjectCover
                height={260}
                image={{ source: null, thumbhash: samples.papillon, label: l.samplePhoto }}
              />
              <ThumbnailsSample l={l} />
            </Stack>
          }
          side={
            <ProjectCard
              title={l.sampleTitle}
              pitch={l.samplePitch}
              author={{ name: 'Léa Moreau', avatar: null }}
              when={l.now}
              status={{ label: l.statuses.testable, strong: true }}
              tryIt={{ label: l.tryIt, onPress: () => {} }}
              image={{ source: null, thumbhash: samples.cafe, label: l.samplePhoto }}
              height={420}
            />
          }
        />
      </Section>

      <Section title={l.memberLists}>
        {/* Les deux en-têtes bien séparés : on voit où l'un finit et où l'autre commence. */}
        <Stack gap="huge">
          <MemberHeader
            name="Léa Moreau"
            handle="@lea_moreau"
            avatar={null}
            bio={l.memberBio}
            toolsTitle={l.favoriteTools}
            tools={[
              { label: 'Claude Code', onPress: () => {} },
              { label: 'Python', onPress: () => {} },
            ]}
            action={
              <Button
                label={l.editProfile}
                variant="secondary"
                icon="pencil-simple"
                onPress={() => {}}
              />
            }
          />
          {/* Sans pseudo (un membre d'avant la tranche 6a, pas encore rattrapé), sans bio ni
            outils : le nom reste seul sous la photo, sans trou. */}
          <MemberHeader
            name="Inès Martin"
            avatar={null}
            bio=""
            toolsTitle={l.favoriteTools}
            tools={[]}
          />
        </Stack>
        {/* Une grille de cartes-liens : une colonne sur téléphone, trois sur ordinateur. */}
        <ProjectGrid empty={l.emptyList}>
          <ProjectCard
            title={l.sampleTitle}
            pitch={l.samplePitch}
            author={{ name: 'Léa Moreau', avatar: null }}
            when={l.now}
            status={{ label: l.statuses.testable, strong: true }}
            image={{ source: null, thumbhash: samples.cafe, label: l.samplePhoto }}
            onPress={() => {}}
            height={360}
          />
          <ProjectCard
            title={l.secondTitle}
            pitch={l.secondPitch}
            author={{ name: 'Léa Moreau', avatar: null }}
            when={l.now}
            status={{ label: l.statuses.idea, strong: false }}
            image={{ source: null, thumbhash: samples.papillon, label: l.samplePhoto }}
            badge={l.private}
            onPress={() => {}}
            height={360}
          />
          <ProjectCard
            title={l.sampleTitle}
            pitch={l.samplePitch}
            author={{ name: 'Léa Moreau', avatar: null }}
            when={l.now}
            status={{ label: l.statuses.building, strong: false }}
            onPress={() => {}}
            height={360}
          />
        </ProjectGrid>
        {/* La même grille, vide. */}
        <ProjectGrid empty={l.emptyList}>{[]}</ProjectGrid>
      </Section>

      <Section title={l.feedSection}>
        {/* Le bouton « Suivre » : pas suivi (miel), suivi (blanc, coché), puis avec une erreur. */}
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          caption={l.followers}
        />
        <FollowButton
          followed
          onPress={() => {}}
          label={l.followLea}
          text={l.following}
          caption={l.followers}
        />
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          error={l.followError}
        />
        {/* Sur la page d'un projet, la démo est l'action principale : « Suivre » reste en blanc. */}
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          caption={l.followers}
          prominent={false}
        />
        <FollowButton
          followed
          onPress={() => {}}
          label={l.followLea}
          text={l.following}
          caption={l.followers}
          error={l.followError}
        />
        {/* La session a expiré : réessayer ne sert à rien, le lien mène à la connexion. */}
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          caption={l.followers}
          prominent={false}
          error={l.expired}
          errorAction={{ label: l.signInAgain, onPress: () => {} }}
        />
        {/* Dans l'en-tête d'une page de membre : le nombre au-dessus, le tout centré. */}
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          caption={l.followers}
          layout="stacked"
        />
        {/* Un compte suspendu (tranche 7c) qui vient de ne plus suivre : inactif, en blanc même là
            où il serait l'action principale. */}
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          caption={l.followers}
          layout="stacked"
          disabled
        />
        {/* Le nombre d'abonnés seul, sur sa propre page. */}
        <FollowerCount text={l.followers} />
        {/* Le haut du fil : la phrase quand il n'y a rien de neuf, le bandeau sinon (même place). */}
        <NewItemsBanner label={null} caption={l.feedCaption} onPress={() => {}} />
        <NewItemsBanner label={l.news} caption={l.feedCaption} onPress={() => {}} />
        {/* Le bas du fil dans ses trois états. */}
        <FeedEnd state="more" moreLabel={l.showMore} endLabel={l.upToDate} onMore={() => {}} />
        <FeedEnd state="loading" moreLabel={l.showMore} endLabel={l.upToDate} onMore={() => {}} />
        <FeedEnd state="end" moreLabel={l.showMore} endLabel={l.upToDate} onMore={() => {}} />
        <FeedEnd
          state="error"
          moreLabel={l.showMore}
          endLabel={l.upToDate}
          errorLabel={l.moreError}
          retryLabel={l.retry}
          onMore={() => {}}
        />
      </Section>

      <Section title={l.notesSection}>
        {/* La note dans le fil, à côté d'une carte de projet : avec la couverture du projet, sans
            couverture (la lumière miel), puis un texte long, coupé après quelques lignes. */}
        <ProjectGrid empty={l.emptyList}>
          <NoteCard
            label={l.noteLabel}
            project={l.sampleTitle}
            author={{ name: 'Léa Moreau', avatar: null }}
            body={l.noteBody}
            when={l.noteWhen}
            image={{ source: null, thumbhash: samples.cafe, label: l.samplePhoto }}
            onPress={() => {}}
          />
          <ProjectCard
            title={l.secondTitle}
            pitch={l.secondPitch}
            author={{ name: 'Max Durand', avatar: null }}
            when={l.now}
            status={{ label: l.statuses.testable, strong: true }}
            image={{ source: null, thumbhash: samples.papillon, label: l.samplePhoto }}
            onPress={() => {}}
          />
          <NoteCard
            label={l.noteLabel}
            project={l.sampleTitle}
            author={{ name: 'Léa Moreau', avatar: null }}
            body={l.noteLong}
            when={l.noteWhen}
            onPress={() => {}}
          />
        </ProjectGrid>
        {/* Le journal, vu par l'auteur (un bouton « Supprimer » par note, une adresse longue qui se
            coupe), puis par un autre membre, puis vide pour l'auteur. Sans note ni message : rien. */}
        <Surface variant="grouped" padding="xl" gap="lg">
          <NoteList
            notes={[
              { id: 'n3', body: l.noteBody, when: l.noteWhen },
              { id: 'n2', body: l.noteUrl, when: l.noteWhen },
              { id: 'n1', body: l.noteOlder, when: l.noteOlderWhen },
            ]}
            onDelete={() => {}}
            deleteLabel={l.deleteNote}
          />
        </Surface>
        <Surface variant="grouped" padding="xl" gap="lg">
          <NoteList
            notes={[
              { id: 'n2', body: l.noteLong, when: l.noteWhen },
              { id: 'n1', body: l.noteOlder, when: l.noteOlderWhen },
            ]}
          />
        </Surface>
        <Surface variant="grouped" padding="xl" gap="lg">
          <NoteList notes={[]} empty={l.journalEmpty} onDelete={() => {}} />
        </Surface>
        {/* Après une suppression : une confirmation discrète (role « status »). */}
        <Notice tone="success" message={l.noteDeleted} polite />
        {/* Écrire une note : fermé, fermé juste après une publication, ouvert (vide, avec un texte,
            en cours d'envoi, texte manquant, envoi refusé). */}
        <NoteComposerSample l={l} open={false} />
        <NoteComposerSample l={l} open={false} success={l.notePublished} />
        <NoteComposerSample l={l} open value="" />
        <NoteComposerSample l={l} open value={l.noteBody} />
        <NoteComposerSample l={l} open value={l.noteBody} pending />
        <NoteComposerSample l={l} open value="" fieldError={l.noteRequired} />
        <NoteComposerSample l={l} open value={l.noteBody} error={l.noteError} />
      </Section>

      <Section title={l.notificationsSection}>
        {/* La cloche : sans nouveauté (pas de pastille), avec 3, puis au-delà de 9 (« 9+ »). Une
            pastille seule, hors de la cloche, pour voir ses formes. */}
        <Stack direction="row" gap="lg" wrap>
          <IconButton
            icon="bell"
            label={l.bell}
            onPress={() => {}}
            badge={<CountBadge count={0} />}
          />
          <IconButton
            icon="bell"
            label={l.bellThree}
            onPress={() => {}}
            badge={<CountBadge count={3} />}
          />
          <IconButton
            icon="bell"
            label={l.bellMany}
            onPress={() => {}}
            badge={<CountBadge count={10} />}
          />
          <CountBadge count={1} />
          <CountBadge count={42} max={99} />
        </Stack>
        {/* Les cartes : nouvelle avec un détail, nouvelle avec l'extrait en citation (qui finit par
            « … » : le nom lu n'y ajoute pas de point), déjà vue avec une citation, sans destination
            (les abonnés au compte), et un titre très long. Une liste annoncée, comme à l'écran. */}
        <Stack gap="sm" accessibilityRole="list">
          <NotificationCard
            icon="heart"
            text={l.notifReactions}
            detail={l.notifReactionsDetail}
            when={l.notifToday}
            isNew
            newLabel={l.notifNew}
            onPress={() => {}}
          />
          <NotificationCard
            icon="chat-circle"
            text={l.notifComment}
            quote={l.notifCommentQuote}
            when={l.notifToday}
            isNew
            newLabel={l.notifNew}
            onPress={() => {}}
          />
          <NotificationCard
            icon="at"
            text={l.notifMention}
            quote={l.notifMentionQuote}
            when={l.notifToday}
            isNew={false}
            newLabel={l.notifNew}
            onPress={() => {}}
          />
          <NotificationCard
            icon="user-plus"
            text={l.notifFollows}
            when={l.notifYesterday}
            isNew={false}
            newLabel={l.notifNew}
          />
          <NotificationCard
            icon="heart"
            text={l.notifLongTitle}
            detail={l.notifReactionsDetail}
            when={l.notifYesterday}
            isNew={false}
            newLabel={l.notifNew}
            onPress={() => {}}
          />
        </Stack>
      </Section>

      <Section title={l.commentsSection}>
        {/* Les réactions sur le projet d'un autre : aucune posée, deux posées, puis un refus de
            l'API. Pour l'auteur : les nombres seuls, sans bouton. */}
        <ReactionSample l={l} mine={[]} />
        <ReactionSample l={l} mine={['useful', 'bravo']} />
        <ReactionSample l={l} mine={['bravo']} error={l.reactionError} />
        <ReactionSample l={l} mine={[]} readOnly />
        {/* Un compte suspendu (tranche 7c) : sa réaction donnée garde son bouton, pour la retirer ;
            les autres ne montrent que leur nombre. */}
        <ReactionSample l={l} mine={['bravo']} lockedExceptMine />
        {/* Le même compte, qui vient de retirer « Utile » : la pastille reste, inactive. */}
        <ReactionSample l={l} mine={['bravo']} lockedExceptMine takenBack={['useful']} />
        {/* Les cartes d'un commentaire : sans action (« Répondre » est au bout du fil ; « Signaler »,
            tranche 7a, est dans la section suivante), le sien, modifié (Modifier, Supprimer), le sien masqué (le bandeau pour
            son auteur), masqué vu par l'auteur du projet (Démasquer), Masquer en cours d'envoi, un
            texte long avec une adresse et un refus de l'API, en cours de modification, et les
            deux emplacements sans auteur. */}
        <Surface variant="grouped" padding="xl" gap="xl">
          <CommentCard
            author={{ name: 'Max Durand', avatar: null }}
            authorLabel={l.maxPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.commentBody}
          />
          <CommentCard
            author={{ name: 'Inès Haddad', avatar: null }}
            authorLabel={l.inesPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            edited={l.commentEdited}
            body={l.commentReply}
            actions={mineActions(l)}
          />
          <CommentCard
            author={{ name: 'Inès Haddad', avatar: null }}
            authorLabel={l.inesPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.commentReply}
            hidden={l.hiddenBanner}
            actions={mineActions(l)}
          />
          <CommentCard
            author={{ name: 'Max Durand', avatar: null }}
            authorLabel={l.maxPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.commentBody}
            hidden={l.hiddenByMe}
            actions={[
              {
                id: 'hide',
                label: l.unhideComment,
                text: l.unhideShort,
                icon: 'eye',
                onPress: () => {},
              },
            ]}
          />
          <CommentCard
            author={{ name: 'Max Durand', avatar: null }}
            authorLabel={l.maxPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.commentBody}
            actions={[
              {
                id: 'hide',
                label: l.hideComment,
                text: l.hideShort,
                icon: 'eye-slash',
                pending: true,
                onPress: () => {},
              },
            ]}
          />
          <CommentCard
            author={{ name: 'Max Durand', avatar: null }}
            authorLabel={l.maxPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.commentLong}
            actions={[
              {
                id: 'hide',
                label: l.hideComment,
                text: l.hideShort,
                icon: 'eye-slash',
                onPress: () => {},
              },
            ]}
            error={l.hideError}
          />
          <CommentCard
            author={{ name: 'Inès Haddad', avatar: null }}
            authorLabel={l.inesPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.commentReply}
            editor={
              <ComposerSample
                field={l.commentField}
                hint={l.editHintHidden}
                submit={l.saveComment}
                value={l.commentReply}
                l={l}
              />
            }
          />
          <CommentCard author={null} when={l.commentWhen} body="" placeholder={l.deletedComment} />
          <CommentCard author={null} when={l.commentWhen} body="" placeholder={l.hiddenComment} />
        </Surface>
        {/* La liste : un fil avec ses réponses et le champ d'une réponse ouvert au bout, un fil
            avec « Répondre » au bout, un fil sous « Commentaire supprimé » (sans « Répondre »),
            puis « Afficher la suite ». Ensuite : la suite qui arrive, la suite en échec,
            « C'est tout », et la liste vide. */}
        <Surface variant="grouped" padding="xl" gap="lg">
          <CommentList
            state="more"
            onMore={() => {}}
            moreLabel={l.showMore}
            endLabel={l.commentsEnd}
            empty={l.commentsEmpty}
          >
            <CommentThread
              root={
                <CommentCard
                  author={{ name: 'Max Durand', avatar: null }}
                  authorLabel={l.maxPage}
                  onAuthorPress={() => {}}
                  when={l.commentWhen}
                  body={l.commentBody}
                />
              }
              replies={[
                <CommentCard
                  key="ines"
                  reply
                  author={{ name: 'Inès Haddad', avatar: null }}
                  authorLabel={l.inesPage}
                  onAuthorPress={() => {}}
                  when={l.commentWhen}
                  body={l.commentReply}
                />,
                <CommentCard
                  key="lea"
                  reply
                  author={{ name: 'Léa Moreau', avatar: null }}
                  authorLabel={l.leaPage}
                  onAuthorPress={() => {}}
                  when={l.commentWhen}
                  body={l.commentReplyLea}
                  actions={mineActions(l)}
                />,
              ]}
              replyAction={replyAction(l)}
              composer={
                <ComposerSample
                  field={l.replyField}
                  hint={l.replyHint}
                  submit={l.submitReply}
                  value=""
                  l={l}
                />
              }
            />
            <CommentThread
              root={
                <CommentCard
                  author={{ name: 'Inès Haddad', avatar: null }}
                  authorLabel={l.inesPage}
                  onAuthorPress={() => {}}
                  when={l.commentWhen}
                  body={l.commentReply}
                />
              }
              replyAction={replyAction(l)}
            />
            <CommentThread
              root={
                <CommentCard
                  author={null}
                  when={l.commentWhen}
                  body=""
                  placeholder={l.deletedComment}
                />
              }
              replies={
                <CommentCard
                  reply
                  author={{ name: 'Léa Moreau', avatar: null }}
                  authorLabel={l.leaPage}
                  onAuthorPress={() => {}}
                  when={l.commentWhen}
                  body={l.commentReplyLea}
                  actions={mineActions(l)}
                />
              }
            />
          </CommentList>
        </Surface>
        {(['loading', 'error', 'end'] as const).map((state) => (
          <Surface key={state} variant="grouped" padding="xl" gap="lg">
            <CommentList
              state={state}
              onMore={() => {}}
              moreLabel={l.showMore}
              endLabel={l.commentsEnd}
              empty={l.commentsEmpty}
              errorLabel={l.commentsMoreError}
              retryLabel={l.retry}
            >
              <CommentCard
                author={{ name: 'Max Durand', avatar: null }}
                authorLabel={l.maxPage}
                onAuthorPress={() => {}}
                when={l.commentWhen}
                body={l.commentBody}
              />
            </CommentList>
          </Surface>
        ))}
        <Surface variant="grouped" padding="xl" gap="lg">
          <CommentList
            state="end"
            onMore={() => {}}
            moreLabel={l.showMore}
            endLabel={l.commentsEnd}
            empty={l.commentsEmpty}
          />
        </Surface>
        {/* Les mentions (tranche 6b). Le champ : sans « @ », « @in » avec deux membres proposés,
            « @zz » sans personne (pas de liste), et une longue liste (5 membres, noms longs). On
            peut y taper : flèches, Entrée, Échap. */}
        <MentionFieldSample l={l} initial={l.mentionPlain} suggestions={[]} />
        <MentionFieldSample l={l} initial={l.mentionTyping} suggestions={TWO_MEMBERS} />
        <MentionFieldSample l={l} initial={l.mentionNobody} suggestions={[]} />
        <MentionFieldSample l={l} initial={l.mentionTyping} suggestions={FIVE_MEMBERS} />
        {/* Le texte publié : deux mentions rendues par l'API (des liens), un pseudo inconnu (du
            texte) ; puis majuscules, pseudo long et adresse e-mail (qui reste du texte). */}
        <Surface variant="grouped" padding="xl" gap="lg">
          <MentionText
            text={l.mentionBody}
            mentions={[{ handle: 'ines_haddad', memberId: 'u5' }]}
            onMemberPress={() => {}}
          />
          <MentionText
            text={l.mentionLongBody}
            mentions={[
              { handle: 'ines_haddad', memberId: 'u5' },
              { handle: 'max_durand_cuisine_b', memberId: 'u2' },
            ]}
            onMemberPress={() => {}}
          />
          <CommentCard
            author={{ name: 'Max Durand', avatar: null }}
            authorLabel={l.maxPage}
            onAuthorPress={() => {}}
            when={l.commentWhen}
            body={l.mentionBody}
            mentions={[{ handle: 'ines_haddad', memberId: 'u5' }]}
            onMemberPress={() => {}}
          />
        </Surface>
      </Section>

      {/* Tranche 7a : « Signaler », et ce que lit l'auteur d'un contenu retiré (reports.tsx). */}
      <ReportSamples />
      <ModerationCatalogue />
      {/* Tranche 7c : le bandeau d'un compte suspendu (suspension.tsx). */}
      <SuspensionCatalogue />
      {/* Tranche 7b : le menu « … » des pages d'un membre et d'un projet (actionMenu.tsx). */}
      <ActionMenuSamples />
      {/* Tranche R2 : onglets, rubriques des réglages, feuille, « Nouvel essai à… », pied (compte.tsx). */}
      <AccountCatalogue />
      <SheetsCatalogue />
      {/* Tranche R2 : le panneau d'entrée et le lien qui quitte l'appli (entrer.tsx). */}
      <EntryCatalogue />
      {/* Tranche R2 : la carte du membre et la mise en page des réglages (reglages.tsx). */}
      <SettingsCatalogue />

      <Section title={l.icons}>
        <Icons />
      </Section>
      <BrandCatalogue />
      <ControlsCatalogue />
      <MaterialsCatalogue />
      <FormSamples />
      <TokensCatalogue />
      <LightCatalogue />
      <AmbiancesCatalogue />
      <LoadingCatalogue />
      <FeedEndCatalogue />
      <MascotCatalogue />
    </Screen>
  )
}

type Labels = (typeof labels)['fr']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="md">
      <Text variant="heading" heading={2}>
        {title}
      </Text>
      {children}
    </Stack>
  )
}

/** Un coin de lumière d'ambiance, pour montrer le verre là où il vit : sur une image. */
function OnLight({ thumbhash, children }: { thumbhash: string; children: ReactNode }) {
  return (
    <Surface padding="none" radius="tile">
      <View style={{ minHeight: 220, overflow: 'hidden', borderRadius: radii.tile }}>
        <AmbientLight thumbhash={thumbhash} />
        <Stack padding="lg" gap="md">
          {children}
        </Stack>
      </View>
    </Surface>
  )
}

function Swatches() {
  const { colors, scheme } = useTheme()
  const names = Object.keys(palettes[scheme]) as ColorName[]
  return (
    <Stack direction="row" gap="sm" wrap>
      {names.map((name) => (
        <Stack key={name} gap="xs">
          <View
            style={{
              width: 104,
              height: 56,
              borderRadius: radii.code,
              backgroundColor: colors[name],
              borderWidth: 1,
              borderColor: colors.line,
            }}
          />
          <Text variant="caption" weight={600}>
            {name}
          </Text>
          <Text variant="caption" tone="muted">
            {colors[name]}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

function TypeScale({ sample }: { sample: string }) {
  const variants = Object.keys(textStyles) as TextVariant[]
  return (
    <Stack gap="md">
      {variants.map((variant) => (
        <Stack key={variant} gap="xxs">
          <Text variant="caption" tone="muted">
            {`${variant}  ${textStyles[variant].size}/${textStyles[variant].lineHeight}`}
          </Text>
          <Text variant={variant}>{sample}</Text>
        </Stack>
      ))}
      <Stack direction="row" gap="lg" wrap>
        {([400, 500, 600, 700] as FontWeight[]).map((weight) => (
          <Text key={weight} weight={weight}>
            {`Funnel Sans ${weight}`}
          </Text>
        ))}
      </Stack>
    </Stack>
  )
}

function Fields({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(l.sampleTitle)
  const [pitch, setPitch] = useState(l.samplePitch)
  const [url, setUrl] = useState('http://192.168.1.12')
  const [handle, setHandle] = useState('lea_moreau')
  return (
    <Columns
      main={
        <Stack gap="lg">
          <FieldGroup>
            <TextField
              label={l.titleField}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              showCount
            />
            <TextField
              label={l.pitchField}
              value={pitch}
              onChangeText={setPitch}
              maxLength={140}
              showCount
            />
            <TextField
              label={l.descriptionField}
              value=""
              onChangeText={() => {}}
              placeholder={l.placeholder}
              multiline
            />
          </FieldGroup>
          {/* Un compteur à la limite (ambre), puis au-delà d'une limite seulement affichée (rouge). */}
          <TextField
            label={l.titleField}
            value={l.sampleTitle}
            onChangeText={() => {}}
            maxLength={l.sampleTitle.length}
            showCount
          />
          <TextField
            label={l.titleField}
            value={l.sampleTitle}
            onChangeText={() => {}}
            limit={l.sampleTitle.length - 2}
            showCount
          />
          {/* Un préfixe (« @ » d'un pseudo), avec son aide et son compteur, au repos puis refusé
              par l'API : l'erreur remplace l'aide (et le lecteur d'écran l'annonce). Toucher le
              libellé ou le « @ » met le curseur dans le champ. */}
          <TextField
            label={l.handleField}
            value={handle}
            onChangeText={setHandle}
            prefix="@"
            limit={20}
            showCount
            hint={l.handleHint}
          />
          <TextField
            label={l.handleField}
            value="ines"
            onChangeText={() => {}}
            prefix="@"
            limit={20}
            showCount
            hint={l.handleHint}
            error={l.handleTaken}
          />
          {/* keepHint (tranche 7b) : l'aide reste sous l'erreur, puis sous la confirmation, et le
              lecteur d'écran lit les deux. Les textes de l'appli : la précision de « Signaler »,
              et le lien d'une démo vérifié. */}
          <TextField
            label={t(($) => $.report.illegalDetails)}
            value=""
            onChangeText={() => {}}
            error={t(($) => $.report.illegalRequired)}
            hint={`${t(($) => $.report.goodFaith)} ${t(($) => $.report.detailsHint)}`}
            keepHint
            multiline
          />
          <TextField
            label={t(($) => $.project.fields.demoUrl)}
            value="https://cafes.example.org"
            onChangeText={() => {}}
            success={t(($) => $.project.fields.demoUrlOk)}
            hint={t(($) => $.project.fields.demoUrlHint)}
            keepHint
          />
        </Stack>
      }
      side={<TextField label={l.demoField} value={url} onChangeText={setUrl} error={l.demoError} />}
    />
  )
}

/** L'éditeur de visuels, avec trois photos d'exemple (leurs résumés flous) qu'on peut réordonner. */
function VisualEditorSample({ l, empty = false }: { l: Labels; empty?: boolean }) {
  const [order, setOrder] = useState(empty ? [] : [samples.cafe, samples.papillon, samples.cafe])
  const [portrait, setPortrait] = useState<string | null>(empty ? null : samples.papillon)
  const move = (from: number, to: number) =>
    setOrder((list) => {
      const copy = [...list]
      const [item] = copy.splice(from, 1)
      if (item !== undefined) copy.splice(to, 0, item)
      return copy
    })
  return (
    <VisualEditor
      labels={l.visualEditor}
      gallery={order.map((thumbhash, index) => ({
        key: `${index}-${thumbhash}`,
        image: { source: null, thumbhash, label: `${l.samplePhoto} (${index + 1})` },
      }))}
      max={6}
      portrait={
        portrait
          ? { key: 'portrait', image: { source: null, thumbhash: portrait, label: l.samplePhoto } }
          : null
      }
      onAdd={() => setOrder((list) => [...list, samples.papillon])}
      onMove={(index, delta) => move(index, index + delta)}
      onMakeCover={(index) => move(index, 0)}
      onRemove={(index) => setOrder((list) => list.filter((_, i) => i !== index))}
      onPickPortrait={() => setPortrait(samples.cafe)}
      onRemovePortrait={() => setPortrait(null)}
    />
  )
}

/** Deux membres proposés après « @in ». */
const TWO_MEMBERS: MentionSuggestion[] = [
  { id: 'u5', name: 'Inès Haddad', handle: 'ines_haddad', avatar: null },
  { id: 'u6', name: 'Iniko Diallo', handle: 'iniko', avatar: null },
]

/** La liste la plus longue (5 membres), avec des noms et des pseudos longs. */
const FIVE_MEMBERS: MentionSuggestion[] = [
  ...TWO_MEMBERS,
  {
    id: 'u7',
    name: 'Ingrid-Marie de la Fontaine-Beauregard',
    handle: 'ingrid_marie_fontain',
    avatar: null,
  },
  { id: 'u8', name: 'Inaya Benali', handle: 'inaya_b', avatar: null },
  { id: 'u9', name: 'Indira Lopes', handle: 'indira_lopes_2', avatar: null },
]

/** Le champ d'un commentaire avec ses suggestions ; on peut y taper (le texte est gardé ici). */
function MentionFieldSample({
  l,
  initial,
  suggestions,
}: {
  l: Labels
  initial: string
  suggestions: MentionSuggestion[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <MentionField
        label={l.mentionField}
        value={value}
        onChangeText={setValue}
        hint={l.mentionHint}
        suggestions={suggestions}
        suggestionsLabel={l.mentionList}
        onQueryChange={() => {}}
        multiline
      />
    </Surface>
  )
}

/** Les vignettes sous une couverture : toucher l'une la sélectionne. */
/** Le champ d'une note dans un état donné, posé dans un journal comme sur la page d'un projet. */
function NoteComposerSample({
  l,
  open,
  value = '',
  pending = false,
  fieldError,
  error,
  success,
}: {
  l: Labels
  open: boolean
  value?: string
  pending?: boolean
  fieldError?: string
  error?: string
  success?: string
}) {
  return (
    <Surface variant="grouped" padding="xl" gap="lg">
      <NoteComposer
        open={open}
        onOpen={() => {}}
        onCancel={() => {}}
        value={value}
        onChangeText={() => {}}
        onSubmit={() => {}}
        pending={pending}
        max={PROJECT_NOTE_MAX}
        labels={{
          open: l.addNote,
          field: l.noteField,
          hint: l.noteHint,
          submit: l.submitNote,
          cancel: l.cancel,
        }}
        fieldError={fieldError}
        error={error}
        success={success}
        autoFocus={false}
      />
    </Surface>
  )
}

/** La barre des réactions, avec des nombres d'exemple et les réactions posées données. */
function ReactionSample({
  l,
  mine,
  readOnly = false,
  error,
  lockedExceptMine = false,
  takenBack = [],
}: {
  l: Labels
  mine: ReactionKind[]
  readOnly?: boolean
  error?: string
  /** Compte suspendu : seules les réactions posées restent des boutons. */
  lockedExceptMine?: boolean
  /** Compte suspendu : les réactions retirées pendant la visite, restées en place, inactives. */
  takenBack?: ReactionKind[]
}) {
  const counts: Record<ReactionKind, number> = {
    amazing: 2,
    inspiring: 0,
    useful: 5,
    funny: 1,
    bravo: 12,
  }
  const items = REACTION_KINDS.map((kind) => {
    const text = l.reactionNames[kind]
    const isMine = mine.includes(kind)
    return {
      kind,
      text,
      count: counts[kind],
      mine: isMine,
      label: isMine ? `${text}, ${l.reacted}, ${counts[kind]}` : `${text}, ${counts[kind]}`,
      locked: lockedExceptMine && !isMine && !takenBack.includes(kind),
      disabled: takenBack.includes(kind),
    }
  })
  return readOnly ? (
    <ReactionBar items={items} readOnly caption={l.ownReactions} />
  ) : (
    <ReactionBar
      items={items}
      onToggle={() => {}}
      label={l.reactionGroup}
      {...(error ? { error } : null)}
    />
  )
}

/** « Répondre », au bout d'un fil. */
const replyAction = (l: Labels) => ({
  id: 'reply',
  label: l.replyAction,
  icon: 'arrow-bend-up-left' as const,
  description: l.commentAbout,
  onPress: () => {},
})

/** Les actions de son propre commentaire : Modifier, Supprimer. */
const mineActions = (l: Labels) => [
  { label: l.editComment, text: l.editShort, icon: 'pencil-simple' as const, onPress: () => {} },
  {
    label: l.deleteComment,
    text: l.deleteShort,
    icon: 'trash' as const,
    tone: 'danger' as const,
    onPress: () => {},
  },
]

/** Le champ d'une réponse ou d'une modification, ouvert, comme sous un commentaire. */
function ComposerSample({
  l,
  field,
  hint,
  submit,
  value,
}: {
  l: Labels
  field: string
  hint: string
  submit: string
  value: string
}) {
  return (
    <NoteComposer
      open
      onOpen={() => {}}
      onCancel={() => {}}
      value={value}
      onChangeText={() => {}}
      onSubmit={() => {}}
      max={COMMENT_MAX}
      labels={{ open: submit, field, hint, submit, cancel: l.cancel }}
      autoFocus={false}
    />
  )
}

function ThumbnailsSample({ l }: { l: Labels }) {
  const [selected, setSelected] = useState(0)
  return (
    <Thumbnails
      items={[samples.cafe, samples.papillon, samples.cafe].map((thumbhash, index) => ({
        key: `${index}`,
        image: { source: null, thumbhash, label: `${l.samplePhoto} (${index + 1})` },
      }))}
      selected={selected}
      onSelect={setSelected}
    />
  )
}

function TagSample({ l }: { l: Labels }) {
  const [tools, setTools] = useState(['Claude', 'Expo', 'Supabase'])
  return (
    <TagInput
      label={l.toolsField}
      values={tools}
      onChange={setTools}
      placeholder={l.toolsPlaceholder}
      removeLabel={(item) => `${l.remove} ${item}`}
      limit="15"
    />
  )
}

function Choicesample({ l }: { l: Labels }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idea' | 'building' | 'testable'>('testable')
  // Sans choix coché au départ : une question à laquelle il faut répondre soi-même, comme le motif
  // d'un retrait dans la modération (tranche 7a), avec ses vrais textes.
  const [ground, setGround] = useState<'illegal' | 'rules' | null>(null)
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [notify, setNotify] = useState(true)
  return (
    <Stack gap="lg">
      <Choices
        label={l.statusField}
        options={[
          { value: 'idea', label: l.statuses.idea },
          { value: 'building', label: l.statuses.building },
          { value: 'testable', label: l.statuses.testable },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Choices
        label={t(($) => $.moderation.groundLabel)}
        options={[
          { value: 'illegal', label: t(($) => $.moderation.grounds.illegal) },
          { value: 'rules', label: t(($) => $.moderation.grounds.rules) },
        ]}
        value={ground}
        onChange={setGround}
      />
      <Segmented
        label={l.visibilityField}
        options={[
          { value: 'public', label: l.public, icon: 'globe-simple' },
          { value: 'private', label: l.private, icon: 'lock-simple' },
        ]}
        value={visibility}
        onChange={setVisibility}
      />
      <Switch label={l.switchLabel} hint={l.switchHint} value={notify} onValueChange={setNotify} />
    </Stack>
  )
}

/** Des interrupteurs rangés dans un groupe de réglages, comme « E-mails » dans « Mon profil ». */
function EmailSwitches({ l }: { l: Labels }) {
  const [recap, setRecap] = useState(true)
  const [mentions, setMentions] = useState(false)
  return (
    // Le pied du groupe en deux phrases, chacune son paragraphe (« Mon profil »).
    <ListGroup title={l.emailsTitle} footer={[l.emailsInstant, l.emailsAccount]}>
      <Switch
        inGroup
        label={l.emailsRecap}
        hint={l.emailsRecapHint}
        value={recap}
        onValueChange={setRecap}
      />
      <Switch
        inGroup
        label={l.emailsMentions}
        hint={l.emailsMentionsHint}
        value={mentions}
        onValueChange={setMentions}
      />
      {/* Désactivé : il pâlit et ne bascule plus. */}
      <Switch
        inGroup
        disabled
        label={l.emailsDisabled}
        hint={l.emailsDisabledHint}
        value={false}
        onValueChange={() => {}}
      />
    </ListGroup>
  )
}

function Icons() {
  const names = Object.keys(iconPaths) as IconName[]
  return (
    <Stack direction="row" gap="md" wrap>
      {names.map((name) => (
        <Stack key={name} gap="xs" align="center">
          <Icon name={name} size={24} />
          <Text variant="micro" tone="muted">
            {name}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}
