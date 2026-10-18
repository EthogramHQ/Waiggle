// Tests des composants d'interface : ce qu'un membre (ou un lecteur d'écran) peut faire avec eux.
// Ils ne vérifient pas l'apparence (couleurs, tailles), qui peut changer librement : seulement le
// comportement, qui ne doit pas changer.
import { appName, fontWeights, maxTextScale } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Choices } from './Choices'
import { IconButton } from './IconButton'
import { MemberHeader } from './MemberHeader'
import { Notice } from './Notice'
import { Pressed } from './Pressed'
import { ProjectCard } from './ProjectCard'
import { ProjectCover } from './ProjectCover'
import { ProjectGrid } from './ProjectGrid'
import { Screen } from './Screen'
import { Segmented } from './Segmented'
import { SheetHeader } from './SheetHeader'
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
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
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

describe('Notice', () => {
  it('is read out as soon as it appears', async () => {
    await renderWithProviders(<Notice message="Mot de passe incorrect." />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Mot de passe incorrect.')).toBeTruthy()
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

    const first = screen.getByRole('button', { name: 'Photo 1 sur 3' })
    expect(first.props.accessibilityState).toMatchObject({ selected: true })
    await fireEvent.press(screen.getByRole('button', { name: 'Photo 2 sur 3' }))

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

    const disabled = (name: string) =>
      screen.getByRole('button', { name }).props.accessibilityState?.disabled
    expect(disabled('Avancer la photo 1')).toBe(true)
    expect(disabled('Reculer la photo 2')).toBe(true)
    expect(disabled('Mettre la photo 1 en couverture')).toBe(true)
    expect(disabled('Reculer la photo 1')).toBeFalsy()
  })

  it('stops offering to add photos once the gallery is full', async () => {
    const full = Array.from({ length: 6 }, (_, i) => tile(i + 1))
    await renderWithProviders(
      <VisualEditor labels={labels} gallery={full} max={6} portrait={null} {...actions()} />,
    )

    expect(
      screen.getByRole('button', { name: 'Ajouter une photo' }).props.accessibilityState,
    ).toMatchObject({ disabled: true })
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

    expect(screen.getByRole('button', { name: 'Publier' }).props.accessibilityState).toMatchObject({
      busy: true,
    })
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
