// Tests des composants d'interface : ce qu'un membre (ou un lecteur d'écran) peut faire avec eux.
// Ils ne vérifient pas l'apparence (couleurs, tailles), qui peut changer librement : seulement le
// comportement, qui ne doit pas changer.
import { appName, fontWeights, maxTextScale } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, useState } from 'react'
import { Platform, TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Choices } from './Choices'
import { CommentCard, type CommentCardHandle } from './CommentCard'
import { CommentList } from './CommentList'
import { CommentThread } from './CommentThread'
import { CountBadge } from './CountBadge'
import { FeedEnd } from './FeedEnd'
import { FollowButton } from './FollowButton'
import { FollowerCount } from './FollowerCount'
import { Hint } from './Hint'
import { IconButton } from './IconButton'
import { MemberHeader } from './MemberHeader'
import { MentionField } from './MentionField'
import { NewItemsBanner } from './NewItemsBanner'
import { NoteCard } from './NoteCard'
import { NoteComposer } from './NoteComposer'
import { NoteList } from './NoteList'
import { Notice } from './Notice'
import { NotificationCard } from './NotificationCard'
import { Pressed } from './Pressed'
import { ProjectCard } from './ProjectCard'
import { ProjectCover } from './ProjectCover'
import { ProjectGrid } from './ProjectGrid'
import { ReactionBar, type ReactionBarItem } from './ReactionBar'
import { Screen } from './Screen'
import { Segmented } from './Segmented'
import { SheetHeader } from './SheetHeader'
import { Stack } from './Stack'
import { StateMessage } from './StateMessage'
import { Step } from './StepNumber'
import { Switch } from './Switch'
import { Tag } from './Tag'
import { TagInput } from './TagInput'
import { Text } from './Text'
import { FieldGroup, TextField } from './TextField'
import { TextLink } from './TextLink'
import { Thumbnails } from './Thumbnails'
import { fontFiles, fontName } from './theme/fonts'
import { VisualEditor, type VisualEditorLabels, type VisualTile } from './VisualEditor'
import { Wordmark } from './Wordmark'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Button', () => {
  it('is announced as a button with its label, and runs its action', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Button label="Publier" onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('cannot be pressed twice while its action is running', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Button label="Publier" onPress={onPress} loading />)

    const button = screen.getByRole('button', { name: 'Publier' })
    await fireEvent.press(button)

    expect(onPress).not.toHaveBeenCalled()
    expect(button).toBeDisabled()
    expect(button).toBeBusy()
  })
})

describe('IconButton', () => {
  it('is named for screen readers even though it only shows an icon', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<IconButton icon="arrow-left" label="Retour" onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Retour' }))

    expect(onPress).toHaveBeenCalled()
  })
})

describe('Segmented', () => {
  function Appearance() {
    const [value, setValue] = useState<'auto' | 'day' | 'night'>('auto')
    return (
      <Segmented
        label="Apparence"
        options={[
          { value: 'auto', label: 'Automatique' },
          { value: 'day', label: 'Jour' },
          { value: 'night', label: 'Nuit' },
        ]}
        value={value}
        onChange={setValue}
      />
    )
  }

  it('is a group of radio buttons with exactly one checked', async () => {
    await renderWithProviders(<Appearance />)

    // Le groupe porte le nom de la question ; chaque choix est un bouton radio.
    expect(screen.getByLabelText('Apparence').props.accessibilityRole).toBe('radiogroup')
    expect(screen.getByRole('radio', { name: 'Automatique', checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: 'Nuit' }))

    expect(screen.getByRole('radio', { name: 'Nuit', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Automatique', checked: false })).toBeTruthy()
  })
})

describe('Switch', () => {
  it('is announced as a switch and flips on press', async () => {
    const onValueChange = jest.fn()
    await renderWithProviders(
      <Switch label="Notifications" value={false} onValueChange={onValueChange} />,
    )

    await fireEvent.press(screen.getByRole('switch', { name: 'Notifications' }))

    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  // Tranche 6c : une ligne d'un groupe de réglages (« E-mails » dans « Mon profil »).
  it('stays a switch with its state and its hint when it is a row of a settings group', async () => {
    const onValueChange = jest.fn()
    await renderWithProviders(
      <Switch
        inGroup
        label="Le récap de la semaine"
        hint="Le lundi matin, seulement s’il y a du nouveau."
        value
        onValueChange={onValueChange}
      />,
    )

    const toggle = screen.getByRole('switch', { name: 'Le récap de la semaine' })
    expect(toggle).toBeChecked()
    expect(screen.getByText('Le lundi matin, seulement s’il y a du nouveau.')).toBeTruthy()
    await fireEvent.press(toggle)
    expect(onValueChange).toHaveBeenCalledWith(false)
  })
})

describe('FollowButton', () => {
  // Un interrupteur plutôt qu'un simple bouton : le lecteur d'écran annonce « Suivre Léa,
  // interrupteur, désactivé », puis « activé » une fois qu'on la suit. Le nom reste le même ;
  // seul le texte affiché change (« Suivre » → « Suivi »).
  it('is a switch named after what it follows, unchecked until followed, and shows the count', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <FollowButton
        followed={false}
        onPress={onPress}
        label="Suivre Léa"
        text="Suivre"
        caption="12 abonnés"
      />,
    )

    const button = screen.getByRole('switch', { name: 'Suivre Léa' })
    expect(button).not.toBeChecked()
    expect(screen.getByText('Suivre')).toBeTruthy()
    expect(screen.getByText('12 abonnés')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    await fireEvent.press(button)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is checked once followed, and shows so', async () => {
    await renderWithProviders(
      <FollowButton followed onPress={jest.fn()} label="Suivre Léa" text="Suivi" />,
    )

    expect(screen.getByRole('switch', { name: 'Suivre Léa' })).toBeChecked()
    expect(screen.getByText('Suivi')).toBeTruthy()
  })

  it('offers the link given with its error (slice 6c)', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <FollowButton
        followed={false}
        onPress={jest.fn()}
        label="Suivre Léa"
        text="Suivre"
        error="Ta session a expiré. Reconnecte-toi pour continuer."
        errorAction={{ label: 'Me reconnecter', onPress }}
      />,
    )

    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reads out its error as soon as it appears', async () => {
    await renderWithProviders(
      <FollowButton
        followed={false}
        onPress={jest.fn()}
        label="Suivre Léa"
        text="Suivre"
        error="L’abonnement n’a pas pu être enregistré. Réessaie."
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'L’abonnement n’a pas pu être enregistré. Réessaie.',
    )
  })
})

describe('NewItemsBanner', () => {
  it('is a button that shows the new items when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<NewItemsBanner label="3 nouveautés" onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: '3 nouveautés' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('NewItemsBanner, with nothing new', () => {
  it('says what the feed shows, with nothing to press', async () => {
    await renderWithProviders(
      <NewItemsBanner
        label={null}
        onPress={jest.fn()}
        caption="Les nouveaux projets des personnes que tu suis."
      />,
    )

    expect(screen.getByText('Les nouveaux projets des personnes que tu suis.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('FollowerCount', () => {
  it('shows the number of followers, never their names', async () => {
    await renderWithProviders(<FollowerCount text="12 abonnés" />)

    expect(screen.getByText('12 abonnés')).toBeTruthy()
  })
})

describe('FeedEnd', () => {
  const labels = { moreLabel: 'Afficher la suite', endLabel: 'Tu es à jour' }

  it('offers to load what comes next', async () => {
    const onMore = jest.fn()
    await renderWithProviders(<FeedEnd state="more" {...labels} onMore={onMore} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher la suite' }))

    expect(onMore).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Tu es à jour')).toBeNull()
  })

  it('stays in place and busy while the next page loads, without asking for it twice', async () => {
    const onMore = jest.fn()
    await renderWithProviders(<FeedEnd state="loading" {...labels} onMore={onMore} />)

    const button = screen.getByRole('button', { name: 'Afficher la suite' })
    await fireEvent.press(button)

    expect(button).toBeBusy()
    expect(onMore).not.toHaveBeenCalled()
  })

  it('says when the next page failed, and offers to retry', async () => {
    const onMore = jest.fn()
    await renderWithProviders(
      <FeedEnd
        state="error"
        {...labels}
        errorLabel="La suite du fil n’a pas pu se charger."
        retryLabel="Réessayer"
        onMore={onMore}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('La suite du fil n’a pas pu se charger.')
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('says the member is up to date at the end, with nothing left to press', async () => {
    await renderWithProviders(<FeedEnd state="end" {...labels} onMore={jest.fn()} />)

    expect(screen.getByText('Tu es à jour')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('TextField', () => {
  it('is found by its label, counts the characters and shows its error', async () => {
    await renderWithProviders(
      <TextField
        label="Titre"
        value="Café"
        onChangeText={() => {}}
        maxLength={80}
        showCount
        error="Le titre est trop long."
      />,
    )

    expect(screen.getByLabelText('Titre')).toBeTruthy()
    expect(screen.getByText('4 / 80')).toBeTruthy()
    expect(screen.getByText('Le titre est trop long.')).toBeTruthy()
  })

  it('passes what is typed to the screen', async () => {
    const onChangeText = jest.fn()
    await renderWithProviders(
      <FieldGroup>
        <TextField label="Nom" value="" onChangeText={onChangeText} />
        <TextField label="Bio" value="" onChangeText={() => {}} hint="280 caractères au plus" />
      </FieldGroup>,
    )

    await fireEvent.changeText(screen.getByLabelText('Nom'), 'Léa')

    expect(onChangeText).toHaveBeenCalledWith('Léa')
    expect(screen.getByText('280 caractères au plus')).toBeTruthy()
  })
})

// Tranche 6a : un champ refusé se dit aux lecteurs d'écran, et son libellé mène à la saisie.
describe('TextField, read by a screen reader', () => {
  it('reads its hint after its name, then its error instead (phone)', async () => {
    const { rerender } = await renderWithProviders(
      <TextField label="Pseudo" value="max" onChangeText={() => {}} hint="3 à 20 caractères" />,
    )
    expect(screen.getByLabelText('Pseudo')).toHaveProp('accessibilityHint', '3 à 20 caractères')

    await rerender(
      <TextField
        label="Pseudo"
        value="max"
        onChangeText={() => {}}
        hint="3 à 20 caractères"
        error="Ce pseudo est déjà pris."
      />,
    )
    expect(screen.getByLabelText('Pseudo')).toHaveProp(
      'accessibilityHint',
      'Ce pseudo est déjà pris.',
    )
  })

  it('announces an error as soon as it appears, politely', async () => {
    await renderWithProviders(
      <TextField label="Pseudo" value="max" onChangeText={() => {}} error="Déjà pris." />,
    )

    // La région vivante entoure le message : il est lu sans que le membre cherche le champ. On
    // remonte du texte jusqu'au premier bloc qui en est une.
    let region = screen.getByText('Déjà pris.').parent
    while (region && region.props['aria-live'] === undefined) region = region.parent
    expect(region).toHaveProp('aria-live', 'polite')
  })

  it('is described by its message and marked invalid on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <TextField label="Pseudo" value="max" onChangeText={() => {}} error="Déjà pris." />,
      )

      const field = screen.getByLabelText('Pseudo')
      expect(field).toHaveProp('aria-invalid', true)
      // aria-describedby cite l'identifiant du bloc qui porte le message.
      const id = field.props['aria-describedby']
      expect(id).toEqual(expect.any(String))
      let described = screen.getByText('Déjà pris.').parent
      while (described && described.props.nativeID !== id) described = described.parent
      expect(described).toHaveTextContent('Déjà pris.')
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('is not marked invalid without an error', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<TextField label="Pseudo" value="max" onChangeText={() => {}} />)

      expect(screen.getByLabelText('Pseudo')).not.toHaveProp('aria-invalid')
      expect(screen.getByLabelText('Pseudo')).not.toHaveProp('aria-describedby')
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('gives the focus to the field when its label or prefix is touched', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    await renderWithProviders(
      <TextField label="Pseudo" value="lea" onChangeText={() => {}} prefix="@" />,
    )

    await fireEvent.press(screen.getByText('Pseudo'))
    // Le « @ » est caché aux lecteurs d'écran (l'étiquette suffit) : on le cherche quand même.
    await fireEvent.press(screen.getByText('@', { includeHiddenElements: true }))

    expect(focus).toHaveBeenCalledTimes(2)
    focus.mockRestore()
  })

  it('lets the screen act on Enter', async () => {
    const onSubmitEditing = jest.fn()
    await renderWithProviders(
      <TextField
        label="Nom"
        value="Léa"
        onChangeText={() => {}}
        onSubmitEditing={onSubmitEditing}
      />,
    )

    await fireEvent(screen.getByLabelText('Nom'), 'submitEditing')

    expect(onSubmitEditing).toHaveBeenCalled()
  })
})

describe('Notice', () => {
  it('is read out as soon as it appears', async () => {
    await renderWithProviders(<Notice message="Mot de passe incorrect." />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Mot de passe incorrect.')).toBeTruthy()
  })

  // Tranche 6c : « Me reconnecter » après « Ta session a expiré ». Le lien est hors de l'alerte :
  // l'alerte ne lit que le message, et le lien reste atteignable à part.
  it('offers a link after its message, outside the alert, that leads elsewhere', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Notice
        message="Ta session a expiré. Reconnecte-toi pour continuer."
        action={{ label: 'Me reconnecter', onPress }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows no link without an action', async () => {
    await renderWithProviders(<Notice message="Mot de passe incorrect." />)

    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('Text', () => {
  it('grows with the device text size, up to twice its size', async () => {
    await renderWithProviders(<Text>Bonjour</Text>)

    expect(screen.getByText('Bonjour').props.maxFontSizeMultiplier).toBe(maxTextScale)
    expect(maxTextScale).toBe(2)
  })
})

describe('Wordmark', () => {
  it('reads the app name as it is written, not in lower case', async () => {
    await renderWithProviders(<Wordmark />)

    expect(screen.getByLabelText(appName)).toBeTruthy()
    expect(screen.getByText(appName.toLowerCase())).toBeTruthy()
  })
})

// Une photo d'exemple : une adresse quelconque (les tests n'affichent pas de vraie image).
const tile = (n: number): VisualTile => ({
  key: `photo-${n}`,
  image: { source: { uri: `https://api.example/${n}.webp` }, label: `Photo ${n} sur 3` },
})

describe('ProjectCover', () => {
  it('names its photo for screen readers', async () => {
    await renderWithProviders(<ProjectCover height={200} image={tile(1).image} />)

    expect(screen.getByLabelText('Photo 1 sur 3')).toBeTruthy()
  })
})

describe('Thumbnails', () => {
  it('names each photo, marks the one shown, and shows another when touched', async () => {
    const onSelect = jest.fn()
    await renderWithProviders(
      <Thumbnails items={[tile(1), tile(2), tile(3)]} selected={0} onSelect={onSelect} />,
    )

    expect(screen.getByRole('tab', { name: 'Photo 1 sur 3' })).toBeSelected()
    await fireEvent.press(screen.getByRole('tab', { name: 'Photo 2 sur 3' }))

    expect(onSelect).toHaveBeenCalledWith(1)
  })
})

describe('VisualEditor', () => {
  const labels: VisualEditorLabels = {
    gallery: 'Photos',
    galleryHint: '6 au plus.',
    cover: 'Couverture',
    add: 'Ajouter une photo',
    earlier: (n) => `Avancer la photo ${n}`,
    later: (n) => `Reculer la photo ${n}`,
    makeCover: (n) => `Mettre la photo ${n} en couverture`,
    remove: (n) => `Retirer la photo ${n}`,
    portrait: 'Couverture verticale',
    portraitHint: 'Sur téléphone.',
    choosePortrait: 'Choisir une couverture verticale',
    replacePortrait: 'Remplacer la couverture verticale',
    removePortrait: 'Retirer la couverture verticale',
  }
  const actions = () => ({
    onAdd: jest.fn(),
    onMove: jest.fn(),
    onMakeCover: jest.fn(),
    onRemove: jest.fn(),
    onPickPortrait: jest.fn(),
    onRemovePortrait: jest.fn(),
  })

  it('names every button after its photo, so that the order can be changed without seeing', async () => {
    const on = actions()
    await renderWithProviders(
      <VisualEditor
        labels={labels}
        gallery={[tile(1), tile(2), tile(3)]}
        max={6}
        portrait={null}
        {...on}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Avancer la photo 2' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Reculer la photo 2' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Mettre la photo 3 en couverture' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer la photo 1' }))

    expect(on.onMove).toHaveBeenNthCalledWith(1, 1, -1)
    expect(on.onMove).toHaveBeenNthCalledWith(2, 1, 1)
    expect(on.onMakeCover).toHaveBeenCalledWith(2)
    expect(on.onRemove).toHaveBeenCalledWith(0)
  })

  it('cannot move the first photo earlier, the last one later, or the cover to the cover', async () => {
    await renderWithProviders(
      <VisualEditor
        labels={labels}
        gallery={[tile(1), tile(2)]}
        max={6}
        portrait={null}
        {...actions()}
      />,
    )

    const button = (name: string) => screen.getByRole('button', { name })
    expect(button('Avancer la photo 1')).toBeDisabled()
    expect(button('Reculer la photo 2')).toBeDisabled()
    expect(button('Mettre la photo 1 en couverture')).toBeDisabled()
    expect(button('Reculer la photo 1')).toBeEnabled()
  })

  it('stops offering to add photos once the gallery is full', async () => {
    const full = Array.from({ length: 6 }, (_, i) => tile(i + 1))
    await renderWithProviders(
      <VisualEditor labels={labels} gallery={full} max={6} portrait={null} {...actions()} />,
    )

    expect(screen.getByRole('button', { name: 'Ajouter une photo' })).toBeDisabled()
  })

  it('offers to choose a vertical cover, then to replace or remove it', async () => {
    const on = actions()
    const { rerender } = await renderWithProviders(
      <VisualEditor labels={labels} gallery={[]} max={6} portrait={null} {...on} />,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Choisir une couverture verticale' }))
    expect(on.onPickPortrait).toHaveBeenCalled()

    await rerender(<VisualEditor labels={labels} gallery={[]} max={6} portrait={tile(9)} {...on} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer la couverture verticale' }))

    expect(screen.getByRole('button', { name: 'Remplacer la couverture verticale' })).toBeTruthy()
    expect(on.onRemovePortrait).toHaveBeenCalled()
  })
})

describe('ProjectCard', () => {
  const card = {
    title: 'Mon agent de recettes',
    pitch: 'Un menu avec ce qu’il y a au frigo.',
    author: { name: 'Léa', avatar: null },
    when: '12 oct.',
    status: { label: 'Idée', strong: false },
  }

  it('becomes a link named after the project in a list, and shows its badge', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<ProjectCard {...card} badge="Privé" onPress={onPress} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Mon agent de recettes' }))

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Privé')).toBeTruthy()
  })

  it('never puts the « Tester » button inside a link', async () => {
    const tryIt = { label: 'Tester', onPress: jest.fn() }
    await renderWithProviders(<ProjectCard {...card} tryIt={tryIt} onPress={jest.fn()} />)

    expect(screen.queryByRole('button', { name: 'Tester' })).toBeNull()
  })
})

describe('ProjectGrid', () => {
  it('shows every card, and no empty message', async () => {
    await renderWithProviders(
      <ProjectGrid empty="Rien pour l’instant.">
        <Text>Un</Text>
        <Text>Deux</Text>
      </ProjectGrid>,
    )

    expect(screen.getByText('Un')).toBeTruthy()
    expect(screen.getByText('Deux')).toBeTruthy()
    expect(screen.queryByText('Rien pour l’instant.')).toBeNull()
  })

  it('says so when there is nothing to list', async () => {
    await renderWithProviders(<ProjectGrid empty="Rien pour l’instant.">{[]}</ProjectGrid>)

    expect(screen.getByText('Rien pour l’instant.')).toBeTruthy()
  })
})

describe('Tag', () => {
  it('is a link to its page when it can be touched, a plain label otherwise', async () => {
    const onPress = jest.fn()
    const { rerender } = await renderWithProviders(<Tag label="Claude Code" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('link', { name: 'Claude Code' }))
    expect(onPress).toHaveBeenCalledTimes(1)

    await rerender(<Tag label="Claude Code" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('Choices', () => {
  it('is a group of radio buttons, one checked, that changes on press', async () => {
    const Sample = () => {
      const [value, setValue] = useState<'idea' | 'done'>('idea')
      return (
        <Choices
          label="Où en est-il ?"
          options={[
            { value: 'idea', label: 'Idée' },
            { value: 'done', label: 'Terminé' },
          ]}
          value={value}
          onChange={setValue}
        />
      )
    }
    await renderWithProviders(<Sample />)
    expect(screen.getByRole('radio', { name: 'Idée', checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: 'Terminé' }))

    expect(screen.getByRole('radio', { name: 'Terminé', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Idée', checked: false })).toBeTruthy()
  })
})

describe('TagInput', () => {
  it('adds a word typed before a comma, and removes it with its named button', async () => {
    const Sample = () => {
      const [values, setValues] = useState(['Claude'])
      return (
        <TagInput
          label="Outils"
          values={values}
          onChange={setValues}
          placeholder="Ajouter un outil"
          removeLabel={(item) => `Retirer ${item}`}
        />
      )
    }
    await renderWithProviders(<Sample />)

    await fireEvent.changeText(screen.getByPlaceholderText('Ajouter un outil'), 'Python,')
    expect(screen.getByRole('button', { name: 'Retirer Python' })).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Claude' }))
    expect(screen.queryByRole('button', { name: 'Retirer Claude' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retirer Python' })).toBeTruthy()
  })
})

describe('TextLink', () => {
  it('is a link by default, or a button when it acts in place', async () => {
    const onPress = jest.fn()
    const { rerender } = await renderWithProviders(
      <TextLink label="Créer un compte" onPress={onPress} />,
    )
    await fireEvent.press(screen.getByRole('link', { name: 'Créer un compte' }))
    expect(onPress).toHaveBeenCalledTimes(1)

    await rerender(<TextLink label="Annuler" onPress={onPress} role="button" />)
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
  })
})

describe('Pressed', () => {
  it('makes any content pressable under a name, as a button or a link', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Pressed label="Mon compte" onPress={onPress} role="link">
        <Text>L</Text>
      </Pressed>,
    )

    await fireEvent.press(screen.getByRole('link', { name: 'Mon compte' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('Button while loading', () => {
  it('keeps its name and announces that it is busy', async () => {
    await renderWithProviders(<Button label="Publier" onPress={() => {}} loading />)

    expect(screen.getByRole('button', { name: 'Publier' })).toBeBusy()
  })
})

describe('Hint', () => {
  it('reads as its text alone, the icon being decorative', async () => {
    await renderWithProviders(<Hint icon="lock-simple" text="Réservé aux membres connectés." />)

    expect(screen.getByText('Réservé aux membres connectés.')).toBeTruthy()
    // L'icône n'est pas annoncée : ni image, ni bouton, rien d'autre que le texte.
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Step', () => {
  it('shows its number, its control and what comes below', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Step value={1} control={<Button label="Télécharger mes données" onPress={onPress} />}>
        <Text>Un fichier avec tout ton contenu.</Text>
      </Step>,
    )

    expect(screen.getByText('1')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Télécharger mes données' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Un fichier avec tout ton contenu.')).toBeTruthy()
  })
})

describe('StateMessage', () => {
  it('says what happened and offers a way out', async () => {
    const retry = jest.fn()
    await renderWithProviders(
      <StateMessage
        kind="error"
        title="Cette page n’a pas pu se charger"
        message="Une erreur inattendue est survenue."
        actions={[
          { label: 'Réessayer', onPress: retry },
          { label: 'Revenir', onPress: () => {} },
        ]}
      />,
    )

    expect(screen.getByRole('header', { name: 'Cette page n’a pas pu se charger' })).toBeTruthy()
    expect(screen.getByText('Une erreur inattendue est survenue.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy()
  })

  it('needs no title while loading', async () => {
    await renderWithProviders(<StateMessage kind="loading" message="Chargement…" />)

    expect(screen.getByText('Chargement…')).toBeTruthy()
    expect(screen.queryByRole('header')).toBeNull()
  })
})

describe('SheetHeader', () => {
  it('offers to cancel and to run the main action, under a title', async () => {
    const cancel = jest.fn()
    const publish = jest.fn()
    await renderWithProviders(
      <SheetHeader
        title="Nouveau projet"
        cancel={{ label: 'Annuler', onPress: cancel }}
        action={{ label: 'Publier', onPress: publish }}
      />,
    )

    expect(screen.getByRole('header', { name: 'Nouveau projet' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier' }))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
  })
})

describe('Screen', () => {
  it('shows a sticky header once, above the content', async () => {
    await renderWithProviders(
      <Screen ambient={false} stickyHeader header={<Text accessibilityRole="header">Barre</Text>}>
        <Text>Contenu</Text>
      </Screen>,
    )

    expect(screen.getAllByRole('header', { name: 'Barre' })).toHaveLength(1)
    expect(screen.getByText('Contenu')).toBeTruthy()
  })

  it('keeps its message in view, once, whether or not the header is sticky', async () => {
    for (const stickyHeader of [true, false]) {
      const { unmount } = await renderWithProviders(
        <Screen
          ambient={false}
          stickyHeader={stickyHeader}
          header={<Text>Barre</Text>}
          notice={<Notice message="Enregistré." />}
        >
          <Text>Contenu</Text>
        </Screen>,
      )
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      await unmount()
    }
  })
})

describe('MemberHeader', () => {
  it('names the member as a header and leads each favourite tool to its page', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <MemberHeader
        name="Léa"
        avatar={null}
        bio="Je bricole des agents."
        toolsTitle="Outils favoris"
        tools={[{ label: 'Claude Code', onPress }]}
      />,
    )

    expect(screen.getByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('Je bricole des agents.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Claude Code' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('leaves out the tools when there are none', async () => {
    await renderWithProviders(
      <MemberHeader name="Léa" avatar={null} bio="" toolsTitle="Outils favoris" tools={[]} />,
    )

    expect(screen.queryByText('Outils favoris')).toBeNull()
  })
})

describe('fonts', () => {
  it('ships a file for every weight the type scale may ask for', () => {
    for (const family of ['display', 'text'] as const) {
      for (const weight of fontWeights[family]) {
        expect(Object.keys(fontFiles)).toContain(fontName(family, weight))
      }
    }
  })

  it('falls back to the closest shipped weight', () => {
    // Funnel Display n'est livrée qu'en 700 : un titre demandé en 500 prend le 700.
    expect(fontName('display', 500)).toBe('FunnelDisplay-700')
    expect(fontName('text', 600)).toBe('FunnelSans-600')
  })
})

// --- Tranche 4b : les notes d'un projet ---

describe('NoteCard', () => {
  const card = {
    label: 'Note de Léa sur Mon agent de recettes',
    project: 'Mon agent de recettes',
    author: { name: 'Léa', avatar: null },
    body: 'v2 : mode hors ligne',
    when: '14 oct.',
  }

  it('is a link named after the note and its project, and opens it when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<NoteCard {...card} onPress={onPress} />)

    await fireEvent.press(
      screen.getByRole('link', { name: 'Note de Léa sur Mon agent de recettes' }),
    )

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows the note, its project, its author and its date', async () => {
    await renderWithProviders(<NoteCard {...card} onPress={jest.fn()} />)

    expect(screen.getByText('v2 : mode hors ligne')).toBeTruthy()
    expect(screen.getByText('Mon agent de recettes')).toBeTruthy()
    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByText('14 oct.')).toBeTruthy()
  })

  it('shows the text exactly as written, without formatting it', async () => {
    // Une note est du texte brut : les astérisques et les balises restent des caractères.
    const body = '**v2** : <b>hors ligne</b>\nEt plus rapide.'
    await renderWithProviders(<NoteCard {...card} body={body} onPress={jest.fn()} />)

    expect(screen.getByText(body)).toBeTruthy()
  })
})

describe('NoteList', () => {
  const notes = [
    { id: 'n2', body: 'v2 : mode hors ligne', when: '14 oct.' },
    { id: 'n1', body: 'Première version en ligne', when: '12 oct.' },
  ]

  it('shows each note with its date, in the order given', async () => {
    await renderWithProviders(<NoteList notes={notes} />)

    const shown = screen.getAllByText(/^(v2 : mode hors ligne|Première version en ligne)$/)
    expect(shown).toHaveLength(2)
    expect(shown[0]).toHaveTextContent('v2 : mode hors ligne')
    expect(shown[1]).toHaveTextContent('Première version en ligne')
    expect(screen.getByText('14 oct.')).toBeTruthy()
    expect(screen.getByText('12 oct.')).toBeTruthy()
  })

  it('offers to delete each note when asked, and says which one', async () => {
    const onDelete = jest.fn()
    await renderWithProviders(
      <NoteList notes={notes} onDelete={onDelete} deleteLabel="Supprimer la note" />,
    )

    const buttons = screen.getAllByRole('button', { name: 'Supprimer la note' })
    expect(buttons).toHaveLength(2)
    const second = buttons[1]
    if (!second) throw new Error('a delete button per note is expected')
    await fireEvent.press(second)

    expect(onDelete).toHaveBeenCalledWith('n1')
  })

  it('offers no delete button without an action', async () => {
    await renderWithProviders(<NoteList notes={notes} deleteLabel="Supprimer la note" />)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the text exactly as written, without formatting it', async () => {
    const body = '**v2** : <b>hors ligne</b>'
    await renderWithProviders(<NoteList notes={[{ id: 'n3', body, when: '15 oct.' }]} />)

    expect(screen.getByText(body)).toBeTruthy()
  })

  it('says so when there is no note, if given a message', async () => {
    await renderWithProviders(<NoteList notes={[]} empty="Pas encore de note." />)

    expect(screen.getByText('Pas encore de note.')).toBeTruthy()
  })

  it('shows nothing at all when there is no note and no message', async () => {
    await renderWithProviders(<NoteList notes={[]} />)

    expect(screen.queryAllByText(/./)).toHaveLength(0)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('NoteComposer', () => {
  const labels = {
    open: 'Publier une note',
    field: 'Ta note',
    hint: 'Ce qui a changé.',
    submit: 'Publier la note',
    cancel: 'Annuler',
  }
  const handlers = () => ({
    onOpen: jest.fn(),
    onCancel: jest.fn(),
    onChangeText: jest.fn(),
    onSubmit: jest.fn(),
  })

  it('is a single button while closed, which asks to open the field', async () => {
    const on = handlers()
    await renderWithProviders(
      <NoteComposer open={false} value="" max={1000} labels={labels} {...on} />,
    )

    expect(screen.queryByLabelText('Ta note')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))

    expect(on.onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows the field with its counter once open, then publishes or cancels', async () => {
    const on = handlers()
    await renderWithProviders(
      <NoteComposer open value="v2" max={1000} labels={labels} {...on} autoFocus={false} />,
    )

    expect(screen.getByLabelText('Ta note')).toHaveDisplayValue('v2')
    expect(screen.getByText('2 / 1000')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

    expect(on.onSubmit).toHaveBeenCalledTimes(1)
    expect(on.onCancel).toHaveBeenCalledTimes(1)
  })

  it('stays busy while the note is on its way, without publishing it twice', async () => {
    const on = handlers()
    await renderWithProviders(
      <NoteComposer open value="v2" max={1000} labels={labels} {...on} pending />,
    )

    const submit = screen.getByRole('button', { name: 'Publier la note' })
    expect(submit).toBeBusy()
    await fireEvent.press(submit)

    expect(on.onSubmit).not.toHaveBeenCalled()
  })

  it('announces a failed publication, above the text kept in the field', async () => {
    await renderWithProviders(
      <NoteComposer open value="v2" max={1000} labels={labels} {...handlers()} error="Raté." />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Raté.')
    expect(screen.getByLabelText('Ta note')).toHaveDisplayValue('v2')
  })

  it('announces the published note once closed', async () => {
    await renderWithProviders(
      <NoteComposer
        open={false}
        value=""
        max={1000}
        labels={labels}
        {...handlers()}
        success="Note publiée."
      />,
    )

    // Une confirmation se lit poliment (role « status »), comme « Note supprimée. » : pas une alerte.
    expect(screen.getByRole('status')).toHaveTextContent('Note publiée.')
    expect(screen.getByRole('button', { name: 'Publier une note' })).toBeTruthy()
  })

  it('freezes the text and waits to be cancelled while the note is on its way', async () => {
    const on = handlers()
    await renderWithProviders(
      <NoteComposer open value="v2" max={1000} labels={labels} {...on} pending />,
    )

    expect(screen.getByLabelText('Ta note')).toHaveProp('editable', false)
    const cancel = screen.getByRole('button', { name: 'Annuler' })
    expect(cancel).toBeDisabled()
    await fireEvent.press(cancel)
    expect(on.onCancel).not.toHaveBeenCalled()
  })
})

// --- Relectures de la 4b ---

describe('TextField counter', () => {
  it('counts like the limit does, an emoji taking two units', async () => {
    // maxLength et les schémas de l'API comptent en unités de texte : « 🐝 » en vaut deux.
    await renderWithProviders(
      <TextField label="Ta note" value="🐝" onChangeText={() => {}} maxLength={1000} showCount />,
    )

    expect(screen.getByText('2 / 1000')).toBeTruthy()
  })
})

describe('TextLink', () => {
  it('can be disabled, and says so', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<TextLink label="Annuler" role="button" onPress={onPress} disabled />)

    const link = screen.getByRole('button', { name: 'Annuler' })
    expect(link).toBeDisabled()
    await fireEvent.press(link)
    expect(onPress).not.toHaveBeenCalled()
  })
})

// --- Tranche 5 : réagir et commenter ---

describe('ReactionBar', () => {
  // Les cinq réactions, telles que l'écran les prépare : le texte affiché, le nombre, et le nom lu
  // par le lecteur d'écran, qui dit aussi si la réaction est la sienne (« réagi »).
  const items: ReactionBarItem[] = [
    { kind: 'amazing', text: 'Bluffant', count: 0, mine: false, label: 'Bluffant, 0' },
    { kind: 'inspiring', text: 'Inspirant', count: 1, mine: false, label: 'Inspirant, 1' },
    { kind: 'useful', text: 'Utile', count: 0, mine: false, label: 'Utile, 0' },
    { kind: 'funny', text: 'Drôle', count: 0, mine: false, label: 'Drôle, 0' },
    { kind: 'bravo', text: 'Bravo', count: 4, mine: true, label: 'Bravo, réagi, 4' },
  ]

  it('is one button per reaction, named after it and its count, and reacts with the one touched', async () => {
    const onToggle = jest.fn()
    await renderWithProviders(<ReactionBar items={items} onToggle={onToggle} />)

    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByText('Bluffant')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Utile, 0' }))

    expect(onToggle).toHaveBeenCalledWith('useful')
  })

  it('says in its name which reaction is the member’s own, and lets her remove it', async () => {
    const onToggle = jest.fn()
    await renderWithProviders(<ReactionBar items={items} onToggle={onToggle} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Bravo, réagi, 4' }))

    expect(onToggle).toHaveBeenCalledWith('bravo')
  })

  it('shows the numbers without any button when read-only, with its caption', async () => {
    const own = items.map((item) => ({
      ...item,
      mine: false,
      label: `${item.text}, ${item.count}`,
    }))
    await renderWithProviders(
      <ReactionBar items={own} readOnly caption="Les réactions à ton projet" />,
    )

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Les réactions à ton projet')).toBeTruthy()
    expect(screen.getByLabelText('Bravo, 4')).toBeTruthy()
    expect(screen.getByLabelText('Inspirant, 1')).toBeTruthy()
  })

  it('reads out its error as soon as it appears', async () => {
    await renderWithProviders(
      <ReactionBar
        items={items}
        onToggle={jest.fn()}
        error="Ta réaction n’a pas pu être enregistrée. Réessaie."
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ta réaction n’a pas pu être enregistrée. Réessaie.',
    )
  })
})

describe('CommentCard', () => {
  const card = {
    author: { name: 'Max', avatar: null },
    authorLabel: 'Voir la page de Max',
    when: '15 oct.',
    body: 'Super idée, je teste ce soir.',
  }

  it('shows its author, its date and its text exactly as written', async () => {
    // Un commentaire est du texte brut : les astérisques et les balises restent des caractères.
    const body = '**Bravo** : <b>ça marche</b>\nEt vite.'
    await renderWithProviders(<CommentCard {...card} body={body} onAuthorPress={jest.fn()} />)

    expect(screen.getByText(body)).toBeTruthy()
    expect(screen.getByText('Max')).toBeTruthy()
    expect(screen.getByText('15 oct.')).toBeTruthy()
  })

  it('leads to the page of its author', async () => {
    const onAuthorPress = jest.fn()
    await renderWithProviders(<CommentCard {...card} onAuthorPress={onAuthorPress} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Voir la page de Max' }))

    expect(onAuthorPress).toHaveBeenCalledTimes(1)
  })

  it('says when it was edited', async () => {
    await renderWithProviders(<CommentCard {...card} onAuthorPress={jest.fn()} edited="modifié" />)

    expect(screen.getByText('modifié')).toBeTruthy()
  })

  it('offers the actions it is given, as buttons named after them', async () => {
    const reply = jest.fn()
    const remove = jest.fn()
    await renderWithProviders(
      <CommentCard
        {...card}
        onAuthorPress={jest.fn()}
        actions={[
          { label: 'Répondre', onPress: reply },
          { label: 'Supprimer le commentaire', onPress: remove },
        ]}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Répondre' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer le commentaire' }))

    expect(reply).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('offers no action when it is given none', async () => {
    await renderWithProviders(<CommentCard {...card} onAuthorPress={jest.fn()} />)

    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy() // témoin : la carte est là
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('shows the banner of a hidden comment, with its text, for the two authors', async () => {
    await renderWithProviders(
      <CommentCard
        {...card}
        onAuthorPress={jest.fn()}
        hidden="Masqué par la personne qui a publié le projet"
      />,
    )

    expect(screen.getByText('Masqué par la personne qui a publié le projet')).toBeTruthy()
    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy()
  })

  it('shows only its placeholder when it has no author', async () => {
    await renderWithProviders(
      <CommentCard author={null} when="15 oct." body="" placeholder="Commentaire supprimé" />,
    )

    expect(screen.getByText('Commentaire supprimé')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Max')).toBeNull()
  })
})

describe('CommentList', () => {
  const labels = { moreLabel: 'Afficher la suite', endLabel: 'C’est tout' }

  it('shows the threads in the order given, then offers the next ones', async () => {
    const onMore = jest.fn()
    await renderWithProviders(
      <CommentList {...labels} state="more" onMore={onMore} empty="Pas encore de commentaire.">
        <Text>Premier fil</Text>
        <Text>Second fil</Text>
      </CommentList>,
    )

    const shown = screen.getAllByText(/^(Premier|Second) fil$/)
    expect(shown[0]).toHaveTextContent('Premier fil')
    expect(shown[1]).toHaveTextContent('Second fil')
    expect(screen.queryByText('Pas encore de commentaire.')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Afficher la suite' }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('says « C’est tout » once every comment is shown', async () => {
    await renderWithProviders(
      <CommentList {...labels} state="end" onMore={jest.fn()} empty="Pas encore de commentaire.">
        <Text>Premier fil</Text>
      </CommentList>,
    )

    expect(screen.getByText('C’est tout')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says so when there is no comment yet, without « C’est tout »', async () => {
    await renderWithProviders(
      <CommentList {...labels} state="end" onMore={jest.fn()} empty="Pas encore de commentaire." />,
    )

    expect(screen.getByText('Pas encore de commentaire.')).toBeTruthy()
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('says when the next comments failed to load, and offers to retry', async () => {
    const onMore = jest.fn()
    await renderWithProviders(
      <CommentList
        {...labels}
        state="error"
        onMore={onMore}
        empty="Pas encore de commentaire."
        errorLabel="La suite des commentaires n’a pas pu se charger."
        retryLabel="Réessayer"
      >
        <Text>Premier fil</Text>
      </CommentList>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La suite des commentaires n’a pas pu se charger.',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })
})

describe('CommentThread', () => {
  it('shows the comment first, then its replies in the order given, then what comes after', async () => {
    await renderWithProviders(
      <CommentThread
        root={<Text>Le commentaire</Text>}
        replies={[<Text key="a">Première réponse</Text>, <Text key="b">Seconde réponse</Text>]}
        footer={<Text>Le champ de réponse</Text>}
      />,
    )

    const shown = screen.getAllByText(
      /^(Le commentaire|Première réponse|Seconde réponse|Le champ de réponse)$/,
    )
    expect(shown.map((node) => node.props.children)).toEqual([
      'Le commentaire',
      'Première réponse',
      'Seconde réponse',
      'Le champ de réponse',
    ])
  })
})

describe('ReactionBar, the member’s own reactions', () => {
  it('marks her own reaction as selected, and only that one', async () => {
    await renderWithProviders(
      <ReactionBar
        items={[
          { kind: 'useful', text: 'Utile', count: 0, mine: false, label: 'Utile, 0' },
          { kind: 'bravo', text: 'Bravo', count: 4, mine: true, label: 'Bravo, réagi, 4' },
        ]}
        onToggle={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Bravo, réagi, 4' })).toBeSelected()
    expect(screen.getByRole('button', { name: 'Utile, 0' })).not.toBeSelected()
  })
})

// --- Relectures de la tranche 5 ---

/** L'ancêtre le plus proche qui porte ce rôle (une liste, un groupe : leur rôle sert au web). */
const ancestorWithRole = (node: ReturnType<typeof screen.getByText>, role: string) => {
  let parent = node.parent
  while (parent && parent.props.role !== role) parent = parent.parent
  return parent
}

describe('ReactionBar, after the reviews', () => {
  const items: ReactionBarItem[] = [
    { kind: 'useful', text: 'Utile', count: 0, mine: false, label: 'Utile, 0' },
    { kind: 'bravo', text: 'Bravo', count: 9, mine: false, label: 'Bravo, 9' },
  ]

  it('is a list of numbers named after its caption when read-only, zeros shown', async () => {
    await renderWithProviders(
      <ReactionBar items={items} readOnly caption="Les réactions à ton projet" />,
    )

    const shown = screen.getAllByRole('listitem')
    expect(shown).toHaveLength(2)
    expect(screen.getByRole('listitem', { name: 'Bravo, 9' })).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Utile, 0' })).toHaveTextContent('Utile0')
    const bravo = screen.getByRole('listitem', { name: 'Bravo, 9' })
    expect(ancestorWithRole(bravo, 'list')?.props.accessibilityLabel).toBe(
      'Les réactions à ton projet',
    )
  })

  it('gathers its buttons in a group, named after what they do', async () => {
    await renderWithProviders(
      <ReactionBar items={items} onToggle={jest.fn()} label="Réagir à ce projet" />,
    )

    const bravo = screen.getByRole('button', { name: 'Bravo, 9' })
    expect(ancestorWithRole(bravo, 'group')?.props.accessibilityLabel).toBe('Réagir à ce projet')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})

describe('CommentCard, after the reviews', () => {
  const card = {
    author: { name: 'Max', avatar: null },
    authorLabel: 'Voir la page de Max',
    onAuthorPress: jest.fn(),
    when: '15 oct.',
    body: 'Super idée, je teste ce soir.',
  }

  it('shows the short text of an action, and gives it its full name', async () => {
    await renderWithProviders(
      <CommentCard
        {...card}
        actions={[{ label: 'Modifier le commentaire', text: 'Modifier', onPress: jest.fn() }]}
      />,
    )

    const edit = screen.getByRole('button', { name: 'Modifier le commentaire' })
    expect(edit).toHaveTextContent('Modifier')
  })

  it('tells screen readers which comment an action is about', async () => {
    await renderWithProviders(
      <CommentCard
        {...card}
        description="Max : Super idée, je teste ce soir."
        actions={[{ label: 'Supprimer le commentaire', onPress: jest.fn() }]}
      />,
    )

    // Sur téléphone, l'indice (sur le web : aria-describedby, vérifié dans --explore).
    expect(screen.getByRole('button', { name: 'Supprimer le commentaire' })).toHaveProp(
      'accessibilityHint',
      'Max : Super idée, je teste ce soir.',
    )
  })

  it('shows the field in place of the text and the actions while editing', async () => {
    await renderWithProviders(
      <CommentCard
        {...card}
        actions={[{ label: 'Modifier le commentaire', onPress: jest.fn() }]}
        editor={<Text>Le champ de modification</Text>}
      />,
    )

    expect(screen.getByText('Le champ de modification')).toBeTruthy()
    expect(screen.queryByText('Super idée, je teste ce soir.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modifier le commentaire' })).toBeNull()
    // Le nom de l'auteur reste : on sait quel commentaire on modifie.
    expect(screen.getByRole('link', { name: 'Voir la page de Max' })).toBeTruthy()
  })

  it('keeps a busy action from acting twice, and says it is busy', async () => {
    const hide = jest.fn()
    await renderWithProviders(
      <CommentCard
        {...card}
        actions={[{ label: 'Masquer le commentaire', pending: true, onPress: hide }]}
      />,
    )

    const button = screen.getByRole('button', { name: 'Masquer le commentaire' })
    expect(button).toBeBusy()
    await fireEvent.press(button)
    expect(hide).not.toHaveBeenCalled()
  })

  it('keeps the same button when « Masquer » becomes « Démasquer » and another action goes', async () => {
    const actions = (hidden: boolean) => [
      ...(hidden ? [] : [{ id: 'edit', label: 'Modifier le commentaire', onPress: jest.fn() }]),
      {
        id: 'hide',
        label: hidden ? 'Démasquer le commentaire' : 'Masquer le commentaire',
        onPress: jest.fn(),
      },
    ]
    const view = await renderWithProviders(<CommentCard {...card} actions={actions(false)} />)
    const before = screen.getByRole('button', { name: 'Masquer le commentaire' })

    await view.rerender(<CommentCard {...card} actions={actions(true)} />)

    // La même clé (« hide ») : React garde le bouton, qui garde le focus du clavier.
    expect(screen.getByRole('button', { name: 'Démasquer le commentaire' })).toBe(before)
  })

  it('focuses an action only where there is a keyboard to follow (web)', async () => {
    const handle = createRef<CommentCardHandle>()
    await renderWithProviders(
      <CommentCard
        {...card}
        handle={handle}
        actions={[{ label: 'Modifier le commentaire', onPress: jest.fn() }]}
      />,
    )

    // Sur téléphone, rien à faire : la poignée répond « non » sans erreur, même hors des actions.
    expect(handle.current?.focusAction(0)).toBe(false)
    expect(handle.current?.focusAction(5)).toBe(false)
  })
})

describe('CommentThread, after the reviews', () => {
  it('offers « Répondre » once, at the end of the thread, after the replies', async () => {
    const reply = jest.fn()
    await renderWithProviders(
      <CommentThread
        root={<Text>Le commentaire</Text>}
        replies={[<Text key="a">Première réponse</Text>]}
        replyAction={{ label: 'Répondre', description: 'Max : Le commentaire', onPress: reply }}
      />,
    )

    const shown = screen.getAllByText(/^(Le commentaire|Première réponse|Répondre)$/)
    expect(shown.map((node) => node.props.children)).toEqual([
      'Le commentaire',
      'Première réponse',
      'Répondre',
    ])
    const button = screen.getByRole('button', { name: 'Répondre' })
    expect(button).toHaveProp('accessibilityHint', 'Max : Le commentaire')
    await fireEvent.press(button)
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it('puts the field of the reply in place of « Répondre »', async () => {
    await renderWithProviders(
      <CommentThread
        root={<Text>Le commentaire</Text>}
        replyAction={{ label: 'Répondre', onPress: jest.fn() }}
        composer={<Text>Le champ de réponse</Text>}
      />,
    )

    expect(screen.getByText('Le champ de réponse')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
  })

  it('offers no « Répondre » when it is not given one', async () => {
    await renderWithProviders(<CommentThread root={<Text>Commentaire supprimé</Text>} />)

    expect(screen.getByText('Commentaire supprimé')).toBeTruthy() // témoin : le fil est là
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('CommentList, after the reviews', () => {
  it('is a list, each thread one of its items', async () => {
    await renderWithProviders(
      <CommentList
        state="end"
        onMore={jest.fn()}
        moreLabel="Afficher la suite"
        endLabel="C’est tout"
        empty="Pas encore de commentaire."
      >
        <Text>Premier fil</Text>
        <Text>Second fil</Text>
      </CommentList>,
    )

    for (const text of ['Premier fil', 'Second fil']) {
      const item = ancestorWithRole(screen.getByText(text), 'listitem')
      expect(item).toBeTruthy()
      expect(item && ancestorWithRole(item, 'list')).toBeTruthy()
    }
  })
})

describe('NoteComposer, on a phone', () => {
  it('shows its short text while closed, and keeps its full name', async () => {
    await renderWithProviders(
      <NoteComposer
        open={false}
        onOpen={jest.fn()}
        onCancel={jest.fn()}
        value=""
        onChangeText={jest.fn()}
        onSubmit={jest.fn()}
        max={1000}
        labels={{
          open: 'Écrire un commentaire',
          openShort: 'Commenter',
          field: 'Ton commentaire',
          hint: 'Tous les membres connectés liront ton commentaire.',
          submit: 'Publier le commentaire',
          cancel: 'Annuler',
        }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toHaveTextContent(
      'Commenter',
    )
  })
})

// --- Tranche 6a : le pseudo ---

describe('TextField with a prefix', () => {
  it('shows the sign before the value, without reading it out or adding it to the value', async () => {
    const onChangeText = jest.fn()
    await renderWithProviders(
      <TextField label="Pseudo" value="lea" onChangeText={onChangeText} prefix="@" />,
    )

    // Le « @ » est dessiné, mais caché aux lecteurs d'écran : ils lisent « Pseudo, lea ».
    expect(screen.getByText('@', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('@')).toBeNull()
    expect(screen.getByLabelText('Pseudo')).toHaveDisplayValue('lea')
    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'lea_m')
    expect(onChangeText).toHaveBeenCalledWith('lea_m')
  })
})

describe('MemberHeader with a handle', () => {
  it('shows the handle under the name, outside the header', async () => {
    await renderWithProviders(
      <MemberHeader
        name="Léa"
        handle="@lea"
        avatar={null}
        bio=""
        toolsTitle="Outils favoris"
        tools={[]}
      />,
    )

    // Le titre reste le seul nom : un lecteur d'écran annonce « Léa, titre », puis « @lea ».
    expect(screen.getByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('@lea')).toBeTruthy()
  })
})

describe('MentionField, beyond the end of the text', () => {
  const suggestions = [{ id: 'u5', name: 'Inès Morel', handle: 'ines_morel', avatar: null }]

  /** Le champ et son texte, comme dans un écran. */
  function Field({ initial }: { initial: string }) {
    const [value, setValue] = useState(initial)
    return (
      <MentionField
        label="Ton commentaire"
        value={value}
        onChangeText={setValue}
        suggestions={suggestions}
        suggestionsLabel="Membres à mentionner"
        onQueryChange={() => {}}
        multiline
      />
    )
  }

  it('completes the mention typed in the middle of the text, where the cursor is', async () => {
    await renderWithProviders(<Field initial="Bravo @in, à demain." />)
    const field = screen.getByLabelText('Ton commentaire')

    // Le curseur juste après « @in » (le champ le dit par onSelectionChange).
    await fireEvent(field, 'selectionChange', { nativeEvent: { selection: { start: 9, end: 9 } } })
    await fireEvent.press(screen.getByRole('option', { name: /Inès Morel/ }))

    // Seul « @in » est remplacé ; la suite (qui commence par une virgule) reste.
    expect(field).toHaveDisplayValue('Bravo @ines_morel , à demain.')
  })

  it('closes the list when the field loses the focus', async () => {
    await renderWithProviders(<Field initial="Bravo @in" />)
    expect(screen.getByLabelText('Membres à mentionner')).toBeTruthy()

    await fireEvent(screen.getByLabelText('Ton commentaire'), 'blur')

    expect(screen.queryByLabelText('Membres à mentionner')).toBeNull()
  })

  it('lets a second Escape close the comment, once the list is closed (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onCancel = jest.fn()
      await renderWithProviders(
        <NoteComposer
          open
          onOpen={() => {}}
          onCancel={onCancel}
          value="Bravo @in"
          onChangeText={() => {}}
          onSubmit={() => {}}
          max={1000}
          labels={{
            open: 'Écrire un commentaire',
            field: 'Ton commentaire',
            hint: 'Tous les membres le liront.',
            submit: 'Publier le commentaire',
            cancel: 'Annuler',
          }}
          mentions={{ suggestions, label: 'Membres à mentionner', onQueryChange: () => {} }}
          autoFocus={false}
        />,
      )
      const pressEscape = () =>
        fireEvent(screen.getByLabelText('Ton commentaire'), 'keyPress', {
          nativeEvent: { key: 'Escape', preventDefault: jest.fn() },
        })

      await pressEscape()
      expect(screen.queryByLabelText('Membres à mentionner')).toBeNull()
      expect(onCancel).not.toHaveBeenCalled()

      await pressEscape()
      expect(onCancel).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

// --- Tranche 6b : la pastille des nouveautés et la carte d'une notification ---

describe('CountBadge', () => {
  it('writes the number, up to the maximum, then « max+ »', async () => {
    await renderWithProviders(
      <>
        <CountBadge count={3} />
        <CountBadge count={10} />
      </>,
    )

    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('10', { includeHiddenElements: true })).toBeNull()
  })

  it('shows nothing at zero', async () => {
    await renderWithProviders(<CountBadge count={0} />)

    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it('is hidden from screen readers: the button that carries it says the number', async () => {
    await renderWithProviders(
      <IconButton
        icon="bell"
        label="Notifications, 3 nouvelles"
        onPress={() => {}}
        badge={<CountBadge count={3} />}
      />,
    )

    expect(screen.getByRole('button', { name: 'Notifications, 3 nouvelles' })).toBeTruthy()
    // Témoin : la pastille est bien dessinée, mais cachée.
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('3')).toBeNull()
  })
})

/** Le premier élément qui porte un rôle, en remontant depuis celui-ci (lui compris). */
type Node = ReturnType<typeof screen.getByText>
const roleAround = (start: Node | null): Node | null => {
  let node = start
  while (node && !node.props.role && !node.props.accessibilityRole) node = node.parent
  return node
}

describe('Stack announced as a list', () => {
  it('makes each child an item of the list', async () => {
    await renderWithProviders(
      <Stack accessibilityRole="list">
        <Text>Un</Text>
        <Text>Deux</Text>
      </Stack>,
    )

    // Chaque texte est dans son élément de liste, et les deux dans la même liste.
    const [one, two] = ['Un', 'Deux'].map((text) => roleAround(screen.getByText(text)))
    expect(one?.props.role).toBe('listitem')
    expect(two?.props.role).toBe('listitem')
    expect(one).not.toBe(two)
    expect(roleAround(one?.parent ?? null)?.props.accessibilityRole).toBe('list')
  })

  it('adds no list item to a plain stack', async () => {
    await renderWithProviders(
      <Stack>
        <Text>Un</Text>
      </Stack>,
    )

    expect(roleAround(screen.getByText('Un'))).toBeNull()
  })
})

describe('NotificationCard', () => {
  it('is a link named by everything it says, « new » first', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <NotificationCard
        icon="heart"
        text="2 réactions sur « Météo »"
        detail="Bravo ×2"
        when="20 oct."
        isNew
        newLabel="Nouveau"
        onPress={onPress}
      />,
    )

    await fireEvent.press(
      screen.getByRole('link', { name: 'Nouveau. 2 réactions sur « Météo ». Bravo ×2. 20 oct.' }),
    )
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says « new » only when it is new', async () => {
    await renderWithProviders(
      <NotificationCard
        icon="at"
        text="Malik parle de toi"
        quote="Demande à @ines"
        when="20 oct."
        isNew={false}
        newLabel="Nouveau"
        onPress={() => {}}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Malik parle de toi. Demande à @ines. 20 oct.' }),
    ).toBeTruthy()
    expect(screen.queryByText('Nouveau', { includeHiddenElements: true })).toBeNull()
  })

  it('adds no full stop after a part that already ends with a sign', async () => {
    await renderWithProviders(
      <NotificationCard
        icon="chat-circle"
        text="Malik a commenté « Météo »"
        quote="Super idée, je teste ce soir…"
        when="20 oct."
        isNew={false}
        newLabel="Nouveau"
        onPress={() => {}}
      />,
    )

    // « ce soir… » et non « ce soir…. » : un lecteur d'écran ne lit pas deux ponctuations.
    expect(
      screen.getByRole('link', {
        name: 'Malik a commenté « Météo ». Super idée, je teste ce soir… 20 oct.',
      }),
    ).toBeTruthy()
  })

  it('is neither a link nor a button without a destination', async () => {
    await renderWithProviders(
      <NotificationCard
        icon="user-plus"
        text="3 personnes de plus te suivent"
        when="19 oct."
        isNew
        newLabel="Nouveau"
      />,
    )

    expect(screen.getByText('3 personnes de plus te suivent')).toBeTruthy()
    expect(screen.getByText('Nouveau')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens with Enter on the web, like the other cards', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <NotificationCard
          icon="heart"
          text="2 réactions"
          when="20 oct."
          isNew={false}
          newLabel="Nouveau"
          onPress={onPress}
        />,
      )

      await fireEvent(screen.getByRole('link'), 'keyDown', {
        key: 'Enter',
        repeat: false,
        preventDefault: () => {},
      })
      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
