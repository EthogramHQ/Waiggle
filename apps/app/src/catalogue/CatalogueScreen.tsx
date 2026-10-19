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
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Choices } from '../ui/Choices'
import { CodeBlock } from '../ui/CodeBlock'
import { Columns } from '../ui/Columns'
import { Constellation } from '../ui/Constellation'
import { Dialog } from '../ui/Dialog'
import { Disclosure } from '../ui/Disclosure'
import { FeedEnd } from '../ui/FeedEnd'
import { FollowButton } from '../ui/FollowButton'
import { FollowerCount } from '../ui/FollowerCount'
import { Hint } from '../ui/Hint'
import { HoneyMeter } from '../ui/HoneyMeter'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Emblem, Honeycomb, PortalRings } from '../ui/Illustrations'
import { type IconName, iconPaths } from '../ui/icons.generated'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { ListGroup, ListRow } from '../ui/ListGroup'
import { Markdown } from '../ui/Markdown'
import { MemberHeader } from '../ui/MemberHeader'
import { NewItemsBanner } from '../ui/NewItemsBanner'
import { NoteCard } from '../ui/NoteCard'
import { NoteComposer } from '../ui/NoteComposer'
import { NoteList } from '../ui/NoteList'
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
import { TagInput } from '../ui/TagInput'
import { Text } from '../ui/Text'
import { FieldGroup, TextField } from '../ui/TextField'
import { TextLink } from '../ui/TextLink'
import { Thumbnails } from '../ui/Thumbnails'
import type { Appearance } from '../ui/theme/appearance'
import { useTheme } from '../ui/theme/ThemeProvider'
import { VisualEditor } from '../ui/VisualEditor'
import { Wordmark } from '../ui/Wordmark'
import { labels } from './labels'

// Des résumés flous (ThumbHash) de deux visuels de projet, pour montrer la lumière d'ambiance.
// Ils ressemblent à des clés secrètes pour l'outil qui cherche les secrets oubliés (gitleaks) :
// le commentaire « gitleaks:allow » lui indique que ce n'en sont pas.
const samples = {
  cafe: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI', // gitleaks:allow
  papillon: 'GdkFJYTHYFSbVnaPWUZndpajf7QG', // gitleaks:allow
}

export function CatalogueScreen() {
  const { i18n } = useTranslation()
  const [dialog, setDialog] = useState(false)
  const { appearance, setAppearance } = useTheme()
  const l = labels[i18n.language === 'en' ? 'en' : 'fr']

  return (
    <Screen width="page">
      <Stack gap="md">
        <Wordmark size="large" />
        <Text variant="title2" accessibilityRole="header">
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
      </Section>

      <Section title={l.surfaces}>
        <Columns
          main={
            <OnLight thumbhash={samples.papillon}>
              <Surface variant="panel" padding="lg" gap="sm">
                <Stack direction="row" gap="sm" align="center">
                  <Avatar name="Léa Moreau" source={null} label="Léa Moreau" size={28} />
                  <Text variant="callout" weight={700}>
                    Léa Moreau
                  </Text>
                </Stack>
                <Text variant="title3">{l.sampleTitle}</Text>
                <Text variant="callout" tone="secondary">
                  {l.samplePitch}
                </Text>
              </Surface>
              <Surface variant="glass" padding="md" fill={false}>
                <Text variant="callout" weight={600}>
                  {l.glass}
                </Text>
              </Surface>
            </OnLight>
          }
          side={
            <Stack gap="md">
              <Surface padding="lg">
                <Text>{l.plain}</Text>
              </Surface>
              <Surface variant="grouped" padding="lg">
                <Text>{l.grouped}</Text>
              </Surface>
            </Stack>
          }
        />
      </Section>

      <Section title={l.avatars}>
        <Stack direction="row" gap="lg" align="center" wrap>
          <Avatar name="Léa" source={null} label="Léa" size={96} />
          <Avatar name="Max" source={null} label="Max" size={44} />
          <Avatar name="Inès" source={null} label="Inès" size={28} />
        </Stack>
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
      </Section>

      {/* Les états d'une page qui n'a pas (encore) son contenu : toujours une issue. */}
      <Section title={l.states}>
        <StateMessage kind="loading" message={l.stateLoading} />
        <StateMessage
          kind="error"
          title={l.stateErrorTitle}
          message={l.stateError}
          actions={[
            { label: l.retry, onPress: () => {} },
            { label: l.goBack, onPress: () => {} },
          ]}
        />
        <StateMessage
          kind="notFound"
          title={l.stateNotFoundTitle}
          message={l.stateNotFound}
          actions={[{ label: l.home, onPress: () => {} }]}
        />
        <StateMessage
          kind="empty"
          title={l.stateEmptyTitle}
          message={l.stateEmpty}
          actions={[{ label: l.publish, onPress: () => {} }]}
        />
        <StateMessage
          kind="signedOut"
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
        <MemberHeader
          name="Léa Moreau"
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
        {/* Dans l'en-tête d'une page de membre : le nombre au-dessus, le tout centré. */}
        <FollowButton
          followed={false}
          onPress={() => {}}
          label={l.followLea}
          text={l.follow}
          caption={l.followers}
          layout="stacked"
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

      <Section title={l.illustrations}>
        <Stack direction="row" gap="lg" wrap align="center">
          <Emblem icon="envelope-simple" />
          <PortalRings />
          <Honeycomb />
        </Stack>
        <Constellation height={260} />
        {/* La scène d'accueil sur ordinateur : le centre reste libre pour le logo. */}
        <Constellation height={420} layout="scene" />
      </Section>

      <Section title={l.icons}>
        <Icons />
      </Section>
    </Screen>
  )
}

type Labels = (typeof labels)['fr']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="md">
      <Text variant="heading" accessibilityRole="header">
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
  const [title, setTitle] = useState(l.sampleTitle)
  const [pitch, setPitch] = useState(l.samplePitch)
  const [url, setUrl] = useState('http://192.168.1.12')
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
        max={1000}
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
  const [status, setStatus] = useState<'idea' | 'building' | 'testable'>('testable')
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
