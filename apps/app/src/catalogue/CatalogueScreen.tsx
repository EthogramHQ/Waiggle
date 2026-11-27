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
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { AmbientLight } from '../ui/AmbientLight'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Choices } from '../ui/Choices'
import { CodeBlock } from '../ui/CodeBlock'
import { Columns } from '../ui/Columns'
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
import { KeyPoints } from '../ui/KeyPoints'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Markdown } from '../ui/Markdown'
import { MarkedAvatar } from '../ui/MarkedAvatar'
import { MemberHeader } from '../ui/MemberHeader'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { Notice } from '../ui/Notice'
import { ProjectCard } from '../ui/ProjectCard'
import { ProjectCover } from '../ui/ProjectCover'
import { ProjectGrid } from '../ui/ProjectGrid'
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
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink, TextLinkShape } from '../ui/TextLink'
import type { Appearance } from '../ui/theme/appearance'
import { useTheme } from '../ui/theme/ThemeProvider'
import { VisualEditor } from '../ui/VisualEditor'
import { Wordmark } from '../ui/Wordmark'
import { ActionMenuSamples } from './actionMenu'
import { AmbiancesCatalogue } from './ambiances'
import { BeforeAfterCatalogue } from './avant-apres'
import { TopBarCatalogue } from './barre-haut'
import { CardsCatalogue } from './cartes'
import { SearchCardsCatalogue } from './cartes-recherche'
import { InvalidChoicesCatalogue } from './champs-invalides'
import { LoadingCatalogue } from './chargement'
import { TestersCornerHeadsCatalogue } from './coin-entetes'
import { TestersCornerCatalogue } from './coin-testeurs'
import { TesterThreadCatalogue } from './coin-testeurs-fil'
import { TestersListCatalogue } from './coin-testeurs-liste'
import { CommentCardCatalogue } from './commentaires-carte'
import { CommentComposerCatalogue } from './commentaires-composer'
import { CommentThreadCatalogue } from './commentaires-fil'
import { ReadMoreCatalogue } from './commentaires-lire-la-suite'
import { CommentMentionsCatalogue } from './commentaires-mentions'
import { NewCommentsCatalogue } from './commentaires-nouveaux'
import { AccountCatalogue } from './compte'
import { ControlsCatalogue } from './controles'
import { EntryCatalogue } from './entrer'
import { ExampleCardsCatalogue } from './exemples-cartes'
import { ExamplePagesCatalogue } from './exemples-pages'
import { ExploreCatalogue } from './explorer'
import { UpdateSheetCatalogue } from './feuille-mise-a-jour'
import { SheetsCatalogue } from './feuilles'
import { FeedCatalogue } from './fil'
import { FeedUpdateCatalogue } from './fil-mise-a-jour'
import { FeedEndCatalogue } from './fin-de-fil'
import { FluidTopBarCatalogue } from './fluidite-barre'
import { ScreenFadeCatalogue } from './fluidite-fondu'
import { AmbientHostCatalogue } from './fluidite-lumiere'
import { HoneyWaveCatalogue } from './fluidite-vague'
import { FormSamples } from './formulaire'
import { UpdateTimelineCatalogue } from './frise'
import { SafeguardsCatalogue } from './garde-fous'
import { CardGridCatalogue } from './grille-cartes'
import { HarvestCatalogue } from './harvest'
import { HarvestChoicesCatalogue } from './harvestChoices'
import { HarvestFiguresCatalogue } from './harvestFigures'
import { HarvestGainsCatalogue } from './harvestGains'
import { HarvestMotionCatalogue } from './harvestMotion'
import { HarvestPanelsCatalogue } from './harvestPanels'
import { TokensCatalogue } from './jetons'
import { LazySection } from './LazySection'
import { labels } from './labels'
import { LightCatalogue } from './lumiere'
import { BrandCatalogue } from './marque'
import { MascotCatalogue } from './mascotte'
import { MaterialsCatalogue } from './matieres'
import { MemberColumnCatalogue } from './membre-colonne'
import { MyCommentsCatalogue } from './mes-commentaires'
import { MyFeedbackCatalogue } from './mes-retours'
import { UpdateFamiliesCatalogue } from './mises-a-jour'
import { UpdateEntryCatalogue } from './mises-a-jour-frise'
import { UpdateLinesCatalogue } from './mises-a-jour-lignes'
import { ModerationCatalogue } from './moderation'
import { ModerationSheetsCatalogue } from './moderation-fenetres'
import { ModerationR9Catalogue } from './moderation-r9'
import { MemberMosaicCatalogue } from './mosaique-membre'
import { NavigationCatalogue } from './navigation'
import { NotificationsCatalogue } from './notifications'
import { ToolsCatalogue } from './outils'
import { AdminCardsCatalogue } from './outils-administration'
import { ToolFieldCatalogue } from './outils-champ'
import { ToolHeaderCatalogue } from './outils-entete'
import { ToolTagsCatalogue } from './outils-etiquettes'
import { ToolFiltersCatalogue } from './outils-filtres'
import { AdminGesturesCatalogue } from './outils-gestes'
import { ToolsWideCatalogue } from './outils-grand'
import { ToolPageSheetsCatalogue } from './outils-page'
import { LegalPagesCatalogue } from './pages-legales'
import { HivePillsCatalogue } from './pastilles'
import { ProjectPartsCatalogue } from './projet-auteur'
import { CapsuleCatalogue } from './projet-capsule'
import { ProjectCategoryCatalogue } from './projet-categorie'
import { ProjectFrameCatalogue } from './projet-ecran'
import { FanCatalogue } from './projet-eventail'
import { GalleryCatalogue } from './projet-galerie'
import { NotFoundPortalCatalogue } from './projet-introuvable'
import { ShareCatalogue } from './projet-partager'
import { ProjectPromptsCatalogue } from './projet-prompts'
import { RecipeCatalogue } from './projet-recette'
import { ProjectGroundworkCatalogue } from './projet-socle'
import { LeavingCatalogue } from './projet-sortie'
import { PublishCategoriesCatalogue } from './publier-categories'
import { PublishDanceCatalogue } from './publier-danse'
import { PublishWindowsCatalogue } from './publier-fenetres'
import { PublishSheetCatalogue } from './publier-feuille'
import { PublishToolsPreviewCatalogue } from './publier-outils-apercu'
import { PublishPillsCatalogue } from './publier-pastilles'
import { PublishPhotosCatalogue } from './publier-photos'
import { PublishPromptCatalogue } from './publier-prompt'
import { PublishDeleteCatalogue } from './publier-supprimer'
import { SearchCatalogue } from './recherche'
import { SettingsCatalogue } from './reglages'
import { NotificationSettingsCatalogue } from './reglages-notifications'
import { RemovalR9Catalogue } from './removal-r9'
import { ReportSamples } from './reports'
import { HiveNewsCatalogue } from './ruches-actualite'
import { HiveCellsCatalogue } from './ruches-alveoles'
import { HiveRowsCatalogue } from './ruches-lignes'
import { ProjectTilesCatalogue } from './ruches-tuiles'
import { ScoutCatalogue } from './scout'
import { ScoutTriageCatalogue } from './scout-triage'
import { SealShelfCatalogue } from './sealShelf'
import { SuspensionCatalogue } from './suspension'
import { TestersCatalogue } from './testeurs'
import { TesterBricksCatalogue } from './testeurs-briques'
import { VisitorCatalogue } from './visiteur'
import { ShowcaseCatalogue } from './vitrine'

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
  const [alsoReportExample, setAlsoReportExample] = useState(false)
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
        <Notice tone="neutral" icon="chat-circle-slash" polite message={l.neutralMessage} />
        {/* Avec une action : un lien sous le message (« Me reconnecter », tranche 6c). */}
        <Notice message={l.expired} action={{ label: l.signInAgain, onPress: () => {} }} />
        {/* Une action faite sur place (« Réessayer ») : `role: 'button'`, annoncée comme un bouton et
            non comme un lien vers une autre page. */}
        <Notice
          message={l.errorMessage}
          action={{ label: l.retry, role: 'button', onPress: () => {} }}
        />
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
        {/* « done » : une démarche partie ou aboutie, avec sa tuile de miel (R4, ménage M7). */}
        <StateMessage
          kind="done"
          icon="envelope-simple"
          level={3}
          title={l.stateDoneTitle}
          message={l.stateDone}
          actions={[{ label: l.goBack, onPress: () => {}, variant: 'secondary' }]}
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
        <VisualEditorSample l={l} />
        {/* Sans couverture verticale : le bouton seul. */}
        <VisualEditorSample l={l} empty />
        {/* La jauge vide (discrète), en cours, puis remplie : sans phrase visible, mais sa place
            est gardée et la phrase reste le nom de la barre de progression. */}
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
          {/* L'allure seule d'un lien (gabarit d'une place gardée) : identique, sans rien à toucher. */}
          <TextLinkShape label={l.createAccount} />
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
        {/* R9 (planche R9-Bloquer) : la fenêtre « Bloquer Max Durand (@max_durand) ? », avec ses
            textes. Un avatar marqué (`MarkedAvatar`) en illustration, un texte riche (`body` :
            `KeyPoints`, résumé, puces, texte complet), la case « Signaler aussi son profil » et la
            garde des tapes (600 ms après l'ouverture). */}
        <Button
          label={t(($) => $.block.titleNamed, { name: 'Max Durand', handle: 'max_durand' })}
          variant="secondary"
          onPress={() => setLongDialog(true)}
        />
        {/* Les deux états de l'avatar marqué (initiales, ici ; la photo, dans la fenêtre d'un
            membre qui en a une) et la liste sans texte complet. */}
        <Row gap="lg" align="center">
          <MarkedAvatar
            name="Max Durand"
            source={null}
            label="Max Durand"
            mark={{ icon: 'prohibit', label: t(($) => $.block.badge) }}
          />
          <MarkedAvatar
            name="Papi"
            source={null}
            label="Papi"
            size={44}
            mark={{ icon: 'prohibit', label: t(($) => $.block.badge) }}
          />
        </Row>
        <KeyPoints
          summary={t(($) => $.block.summary, { name: 'Max Durand' })}
          points={[
            { icon: 'eye-slash', text: t(($) => $.block.bullets.content) },
            // R12 (Q19) : un projet public se voit sans compte, donc aussi de la personne bloquée.
            { icon: 'globe-simple', text: t(($) => $.block.bullets.publicProjects) },
            { icon: 'users', text: t(($) => $.block.bullets.follows) },
          ]}
        />
        <Dialog
          visible={longDialog}
          illustration={
            <MarkedAvatar
              name="Max Durand"
              source={null}
              label="Max Durand"
              mark={{ icon: 'prohibit', label: t(($) => $.block.badge) }}
            />
          }
          title={t(($) => $.block.titleNamed, { name: 'Max Durand', handle: 'max_durand' })}
          body={
            <KeyPoints
              summary={t(($) => $.block.summary, { name: 'Max Durand' })}
              points={[
                { icon: 'eye-slash', text: t(($) => $.block.bullets.content) },
                { icon: 'users', text: t(($) => $.block.bullets.follows) },
                { icon: 'bell-slash', text: t(($) => $.block.bullets.notTold) },
                { icon: 'flag', text: t(($) => $.block.bullets.moderation) },
              ]}
              details={{
                title: t(($) => $.block.fullText),
                paragraphs: [
                  t(($) => $.block.hidden),
                  t(($) => $.block.remains, { handle: 'max_durand' }),
                  t(($) => $.block.follows),
                  t(($) => $.block.notTold, { handle: 'max_durand' }),
                  t(($) => $.block.notModeration),
                ],
              }}
            />
          }
          guardTaps
          onDismiss={() => setLongDialog(false)}
        >
          <Checkbox
            label={t(($) => $.block.alsoReport)}
            value={alsoReportExample}
            onValueChange={setAlsoReportExample}
          />
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
        {/* Le haut du fil : la phrase quand il n'y a rien de neuf, le bouton sinon (même place).
            Le bouton écrit son texte selon ce qui est arrivé : projets, une note, les deux au-delà
            d'une page (« ou plus »), et l'étincelle à la place des visages sans auteur connu. */}
        <NewItemsBanner
          count={null}
          more={false}
          kinds={[]}
          authors={[]}
          caption={l.feedCaption}
          onPress={() => {}}
        />
        <NewItemsBanner
          count={3}
          more={false}
          kinds={['project']}
          authors={newsAuthors.slice(0, 2)}
          caption={l.feedCaption}
          onPress={() => {}}
        />
        <NewItemsBanner
          count={1}
          more={false}
          kinds={['update']}
          authors={newsAuthors.slice(0, 1)}
          caption={l.feedCaption}
          onPress={() => {}}
        />
        <NewItemsBanner
          count={20}
          more
          kinds={['project', 'update']}
          authors={newsAuthors}
          caption={l.feedCaption}
          onPress={() => {}}
        />
        <NewItemsBanner
          count={2}
          more={false}
          kinds={['project']}
          authors={[]}
          caption={l.feedCaption}
          onPress={() => {}}
        />
        {/* Le bas du fil : il en reste, la suite arrive, la suite a raté (la fin ne dit rien, RF). */}
        <FeedEnd state="more" moreLabel={l.showMore} onMore={() => {}} />
        <FeedEnd state="loading" moreLabel={l.showMore} onMore={() => {}} />
        <FeedEnd
          state="error"
          moreLabel={l.showMore}
          errorLabel={l.moreError}
          retryLabel={l.retry}
          onMore={() => {}}
        />
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
      </Section>
      {/* Tranche R8, les lignes de la page Activité, jour et nuit (notifications.tsx). */}
      <LazySection title={l.lazy.activity}>
        <NotificationsCatalogue />
        {/* Tranche R8, l'exemple et les lignes de choix des réglages (reglages-notifications.tsx). */}
        <NotificationSettingsCatalogue />
        {/* Tranche R10, l'actualité et les membres d'une ruche, jour et nuit (ruches-actualite.tsx). */}
        <HiveNewsCatalogue />
      </LazySection>

      {/* Tranche R5b : la carte, « Lire la suite », le fil et l'aperçu, les mentions, le champ. */}
      <LazySection title={l.lazy.comments}>
        <CommentCardCatalogue />
        <ReadMoreCatalogue />
        <CommentThreadCatalogue />
        <CommentMentionsCatalogue />
        <CommentComposerCatalogue />
        {/* Tranche R21 : le bouton « 1 nouveau commentaire » et sa place (commentaires-nouveaux.tsx). */}
        <NewCommentsCatalogue />
      </LazySection>
      {/* Tranche 7a : « Signaler », et ce que lit l'auteur d'un contenu retiré (reports.tsx). */}
      <LazySection title={l.lazy.moderation}>
        <ReportSamples />
        <ModerationCatalogue />
        <ModerationR9Catalogue />
        {/* R9 : les briques de la fenêtre « Retirer » (moderation-fenetres.tsx). */}
        <ModerationSheetsCatalogue />
        {/* Tranche 7c : le bandeau d'un compte suspendu (suspension.tsx). */}
        <SuspensionCatalogue />
      </LazySection>
      {/* Tranche R11 : le corps d'une page légale et les liens vers les quatre pages (pages-legales.tsx). */}
      <LazySection title={l.lazy.visitors}>
        <LegalPagesCatalogue />
        {/* Tranche R12 : la barre d'un visiteur, les réactions et les commentaires réservés (visiteur.tsx). */}
        <VisitorCatalogue />
        {/* Tranche R12 : la carte de la vitrine de l'accueil et de « À la une » (vitrine.tsx). */}
        <ShowcaseCatalogue />
      </LazySection>
      {/* Tranche R11 : la ligne de « Mes commentaires » (mes-commentaires.tsx). */}
      <LazySection title={l.lazy.myData}>
        <MyCommentsCatalogue />
        {/* Tranche R11 : « Mes retours envoyés », la carte d'un projet et ses messages (mes-retours.tsx). */}
        <MyFeedbackCatalogue />
        <RemovalR9Catalogue />
      </LazySection>
      {/* Tranche R10 : l'alvéole d'une ruche et le choix de son icône (ruches-alveoles.tsx). */}
      <LazySection title={l.lazy.hives}>
        <HiveCellsCatalogue />
        {/* Tranche R10, la ligne d'une ruche et la carte d'une invitation (ruches-lignes.tsx). */}
        <HiveRowsCatalogue />
        {/* Tranche R10, la pastille et le menu « … » d'une tuile de projet (ruches-tuiles.tsx). */}
        <ProjectTilesCatalogue />
      </LazySection>
      {/* Tranche 7b : le menu « … » des pages d'un membre et d'un projet (actionMenu.tsx). */}
      <LazySection title={l.lazy.account}>
        <ActionMenuSamples />
        {/* Tranche R2 : onglets, rubriques des réglages, feuille, « Nouvel essai à… », pied (compte.tsx). */}
        <AccountCatalogue />
        <SheetsCatalogue />
        <PublishSheetCatalogue />
      </LazySection>
      {/* Tranche R2 : le panneau d'entrée et le lien qui quitte l'appli (entrer.tsx). */}
      <LazySection title={l.lazy.settings}>
        <EntryCatalogue />
        {/* Tranche R2 : la carte du membre et la mise en page des réglages (reglages.tsx). */}
        <SettingsCatalogue />
        {/* Tranche R2 : le bouton « à réessayer plus tard » et l'encadré « à savoir » (garde-fous.tsx). */}
        <SafeguardsCatalogue />
        <PublishWindowsCatalogue />
      </LazySection>
      {/* Tranche R3 : la barre d'onglets (navigation.tsx), la pastille « Suivre » sur une carte
          (cartes.tsx), le carrousel et la carte testeur (explorer.tsx), le surlignage (recherche.tsx). */}
      <LazySection title={l.lazy.navigation}>
        <NavigationCatalogue />
        <TopBarCatalogue />
        <CardsCatalogue />
        {/* R16 : la carte d'un résultat de recherche, en grand (cartes-recherche.tsx). */}
        <SearchCardsCatalogue />
      </LazySection>
      <LazySection title={l.lazy.feed}>
        <FeedCatalogue />
        <ExploreCatalogue />
      </LazySection>
      <LazySection title={l.lazy.tools}>
        <ToolsCatalogue />
        <InvalidChoicesCatalogue />
        <ToolTagsCatalogue />
        <ToolFiltersCatalogue />
        {/* Tranche R10 : le sélecteur de ruches du Fil (pastilles.tsx). */}
        <HivePillsCatalogue />
      </LazySection>
      <LazySection title={l.lazy.admin}>
        <ToolFieldCatalogue />
        <ToolHeaderCatalogue />
        <AdminCardsCatalogue />
        <AdminGesturesCatalogue />
        <ToolPageSheetsCatalogue />
        <SearchCatalogue />
      </LazySection>
      {/* Tranche R5a, la page projet : le socle (prudence, dépliant, paire de boutons ; cadre de
          l'écran et place flottante), puis les pièces dans l'ordre de la page : galerie, en-tête et
          actions, capsule, éventail et vue de l'auteur, prompts, Partager, la page de sortie et son
          portail, l'introuvable (projet-*.tsx). */}
      <LazySection title={l.lazy.project}>
        <ProjectGroundworkCatalogue />
        <ProjectFrameCatalogue />
        <GalleryCatalogue />
        <ProjectPartsCatalogue />
      </LazySection>
      {/* Tranche R12b : les en-têtes d'un projet d'exemple et du compte d'exemples
          (exemples-pages.tsx). */}
      <LazySection title={l.lazy.examples}>
        <ExamplePagesCatalogue />
        {/* Tranche R12b : la pastille « Exemple » et les cartes d'un projet d'exemple
          (exemples-cartes.tsx). */}
        <ExampleCardsCatalogue />
        {/* Tranche R14 : la carte compacte et la mosaïque des projets d'un membre
          (mosaique-membre.tsx). */}
        <MemberMosaicCatalogue />
        <MemberColumnCatalogue />
        {/* Relectures de R6b : catégorie en lien, abonnés à la place d'un bouton, liste vide et
          son issue (projet-categorie.tsx). */}
        <ProjectCategoryCatalogue />
      </LazySection>
      {/* Tranche R6a, la feuille de publication (publier-*.tsx). */}
      <LazySection title={l.lazy.publish}>
        <PublishPhotosCatalogue />
        <PublishToolsPreviewCatalogue />
        <PublishPromptCatalogue />
        <PublishPillsCatalogue />
        <PublishDanceCatalogue />
        <PublishDeleteCatalogue />
        <PublishCategoriesCatalogue />
      </LazySection>
      <LazySection title={l.lazy.projectParts}>
        <RecipeCatalogue />
        <CapsuleCatalogue />
        <FanCatalogue />
        <ProjectPromptsCatalogue />
        <ShareCatalogue />
        <LeavingCatalogue />
        <NotFoundPortalCatalogue />
      </LazySection>
      {/* Tranche R7a, les mises à jour d'un projet (mises-a-jour*.tsx). */}
      <LazySection title={l.lazy.testers}>
        <UpdateFamiliesCatalogue />
        {/* Tranche R7a, les testeurs d'un projet (testeurs.tsx). */}
        <TestersCatalogue />
        {/* Tranche R7b, les briques du coin des testeurs (testeurs-briques.tsx). */}
        <TesterBricksCatalogue />
        {/* Tranche R7b, les en-têtes des feuilles et du fil du coin des testeurs (coin-entetes.tsx). */}
        <TestersCornerHeadsCatalogue />
        {/* Tranche R7b, le fil des retours : bulles et liste des fils (coin-testeurs-fil.tsx). */}
        <TesterThreadCatalogue />
        {/* Tranche R7b, la liste des testeurs du coin, que l'auteur déplie (coin-testeurs-liste.tsx). */}
        <TestersListCatalogue />
        {/* Tranche R7b, les onglets, les appels et les retours réglés du coin (coin-testeurs.tsx). */}
        <TestersCornerCatalogue />
      </LazySection>
      {/* Tranche R7a, l'avant / après d'une mise à jour (avant-apres.tsx). */}
      <LazySection title={l.lazy.updates}>
        <BeforeAfterCatalogue />
        {/* Tranche R7a, les lignes « Ce qui a changé » d'une mise à jour (mises-a-jour-lignes.tsx). */}
        <UpdateLinesCatalogue />
        {/* Tranche R7a, une mise à jour en entier, dans la frise du projet (mises-a-jour-frise.tsx). */}
        <UpdateEntryCatalogue />
        {/* Tranche R7a, la frise des mises à jour et la ligne des dates d'un projet (frise.tsx). */}
        <UpdateTimelineCatalogue />
        {/* Tranche R7a, la carte d'un projet mis à jour dans le fil (fil-mise-a-jour.tsx). */}
        <FeedUpdateCatalogue />
        {/* Tranche R7a, la feuille « Nouvelle mise à jour » (feuille-mise-a-jour.tsx). */}
        <UpdateSheetCatalogue />
      </LazySection>
      {/* Tranche RF, la fluidité : la barre du haut fixe et sa goutte qui glisse, le fondu des
          pages, la lumière commune à toutes les pages (fluidite-*.tsx). */}
      <LazySection title={l.lazy.fluidity}>
        <FluidTopBarCatalogue />
        <ScreenFadeCatalogue />
        <AmbientHostCatalogue />
        {/* Tranche R17, la vague de miel à l'entrée dans l'appli (fluidite-vague.tsx). */}
        <HoneyWaveCatalogue />
      </LazySection>

      <Section title={l.icons}>
        <Icons />
      </Section>
      <LazySection title={l.lazy.brand}>
        <BrandCatalogue />
        <ControlsCatalogue />
        <MaterialsCatalogue />
        <FormSamples />
      </LazySection>
      <LazySection title={l.lazy.light}>
        <TokensCatalogue />
        <LightCatalogue />
        <AmbiancesCatalogue />
        <LoadingCatalogue />
      </LazySection>
      {/* Tranche R16 : la grille de cartes commune, la carte d'une ruche et sa pièce vide
          (grille-cartes.tsx). */}
      <LazySection title={l.lazy.grids}>
        <CardGridCatalogue />
        {/* Tranche R16 : la carte d'un outil, sa pièce vide et la liste en colonnes d'Outils en grand
          (outils-grand.tsx). */}
        <ToolsWideCatalogue />
        <FeedEndCatalogue />
        <MascotCatalogue />
      </LazySection>
      {/* Tranche R19, la gamification : le rayon, les sceaux et leurs tuiles (harvest.tsx), puis ce
          qui bouge, l'alvéole du niveau et la pastille de pollen (harvestMotion.tsx). */}
      <LazySection title={l.lazy.harvest}>
        <HarvestCatalogue />
        <HarvestMotionCatalogue />
        {/* La pastille posée sur le geste et le rayon qui se vide (harvestGains.tsx). */}
        <HarvestGainsCatalogue />
        {/* Le panneau du niveau, la carte d'un défi et le classement (harvestPanels.tsx). */}
        <HarvestPanelsCatalogue />
        {/* Le choix du défi, la décoration du rayon et le pollen par famille (harvestChoices.tsx). */}
        <HarvestChoicesCatalogue />
        {/* Les sceaux d'un membre sur sa page (sealShelf.tsx). */}
        <SealShelfCatalogue />
        {/* Le montant en grand de « Ma récolte » (harvestFigures.tsx). */}
        <HarvestFiguresCatalogue />
        {/* Tranche R20 : la Goutte des Éclaireuses, dans tous ses états (scout.tsx). */}
        <ScoutCatalogue />
        {/* Tranche R20 : la page de tri des Éclaireuses, ses tuiles, rangées et listes. */}
        <ScoutTriageCatalogue />
      </LazySection>
    </Screen>
  )
}

type Labels = (typeof labels)['fr']

/**
 * Une section écrite dans ce fichier : son titre, puis ses exemples. Elle n'est montée que près de
 * la vue (`LazySection`, R18) : tout monter d'un coup figeait la page plus d'une minute. Les
 * sections des autres fichiers sont groupées plus haut, chaque groupe dans sa `LazySection`.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <LazySection title={title}>
      <Stack gap="md">
        <Text variant="heading" heading={2}>
          {title}
        </Text>
        {children}
      </Stack>
    </LazySection>
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

/**
 * La couverture verticale (R6a : `VisualEditor` ne garde qu'elle ; la galerie est `PhotoTiles`,
 * dans « Publier : les photos »).
 */
function VisualEditorSample({ l, empty = false }: { l: Labels; empty?: boolean }) {
  const [portrait, setPortrait] = useState<string | null>(empty ? null : samples.papillon)
  return (
    <VisualEditor
      labels={l.visualEditor}
      portrait={
        portrait
          ? { key: 'portrait', image: { source: null, thumbhash: portrait, label: l.samplePhoto } }
          : null
      }
      onPickPortrait={() => setPortrait(samples.cafe)}
      onRemovePortrait={() => setPortrait(null)}
    />
  )
}

/** Les auteurs des nouveautés du fil, sans photo : leurs initiales s'affichent dans le bouton. */
const newsAuthors = [
  { name: 'Léa Moreau', source: null },
  { name: 'Noé Blanc', source: null },
  { name: 'Inès Haddad', source: null },
]

/** Les vignettes sous une couverture : toucher l'une la sélectionne. */
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
