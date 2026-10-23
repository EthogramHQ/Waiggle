// Tests de la carte d'un signalement dans la file de modération (tranche 7a). À part de
// components.test.tsx : ReportCard est écrit par un autre agent que CommentCard et NoteList ; tant
// qu'il manque, seul ce fichier échoue, et les autres tests des composants restent lisibles.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ReportCard } from './ReportCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ReportCard', () => {
  const card = {
    kind: 'Commentaire',
    snapshot: 'Envoie-moi le code de ta carte, je te débloque la version pro.',
    snapshotLabel: 'Texte au moment du signalement ; images actuelles',
    count: '3 signalements',
    reasons: ['Arnaque ou spam ×2', 'Harcèlement ou haine ×1'],
    details: ['Il a écrit la même chose sous trois projets.'],
    when: 'Premier signalement le 20 oct.',
    viewLabel: 'Voir',
  }

  it('shows the kind, the text reported, the reasons with their count, the details and the date', async () => {
    await renderWithProviders(<ReportCard {...card} onView={jest.fn()} />)

    expect(screen.getByText('Commentaire')).toBeTruthy()
    expect(screen.getByText(card.snapshot)).toBeTruthy()
    expect(screen.getByText('3 signalements')).toBeTruthy()
    expect(screen.getByText('Arnaque ou spam ×2')).toBeTruthy()
    expect(screen.getByText('Harcèlement ou haine ×1')).toBeTruthy()
    expect(screen.getByText('Il a écrit la même chose sous trois projets.')).toBeTruthy()
    expect(screen.getByText('Premier signalement le 20 oct.')).toBeTruthy()
  })

  it('says the text is the one reported, and the images today’s (rule 22)', async () => {
    await renderWithProviders(<ReportCard {...card} onView={jest.fn()} />)

    expect(screen.getByText('Texte au moment du signalement ; images actuelles')).toBeTruthy()
  })

  it('shows the text and the details as plain text, without Markdown or a link to touch', async () => {
    // Règle 22 : ce qu'un membre a écrit ne devient jamais un lien dans la file de modération.
    const snapshot = '**Gratuit** : [clique ici](https://piege.example) <b>vite</b>'
    const details = ['Voir [la preuve](https://autre-piege.example)']
    await renderWithProviders(
      <ReportCard {...card} snapshot={snapshot} details={details} onView={jest.fn()} />,
    )

    expect(screen.getByText(snapshot)).toBeTruthy()
    expect(screen.getByText(details[0] ?? '')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /clique ici|la preuve|piege/ })).toBeNull()
    // Le seul lien de la carte : « Voir ».
    expect(screen.getAllByRole('link').map((link) => link.props.accessibilityLabel)).toEqual([
      'Voir',
    ])
  })

  it('leads to the content through « Voir »', async () => {
    const onView = jest.fn()
    await renderWithProviders(<ReportCard {...card} onView={onView} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Voir' }))

    expect(onView).toHaveBeenCalledTimes(1)
  })

  it('offers the actions it is given, as buttons named after them', async () => {
    const remove = jest.fn()
    const dismiss = jest.fn()
    await renderWithProviders(
      <ReportCard
        {...card}
        onView={jest.fn()}
        actions={[
          { label: 'Retirer', onPress: remove, tone: 'danger' },
          { label: 'Classer sans suite', onPress: dismiss },
        ]}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Classer sans suite' }))

    expect(remove).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('offers no action when it is given none, and says why when told', async () => {
    await renderWithProviders(
      <ReportCard
        {...card}
        onView={jest.fn()}
        status="Te concerne : un autre administrateur doit décider."
      />,
    )

    expect(screen.getByText('Te concerne : un autre administrateur doit décider.')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('has no « Voir » link when it is given nowhere to lead (a removed project)', async () => {
    await renderWithProviders(
      <ReportCard
        {...card}
        viewLabel={undefined}
        actions={[{ label: 'Rétablir', onPress: jest.fn() }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeTruthy() // témoin
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('replaces its buttons with the outcome once decided, and keeps the content in place', async () => {
    await renderWithProviders(
      <ReportCard
        {...card}
        onView={jest.fn()}
        decided={{ message: 'Signalement classé sans suite.', ok: true }}
        actions={[{ label: 'Classer sans suite', onPress: jest.fn() }]}
      />,
    )

    expect(screen.getByRole('status', { name: 'Signalement classé sans suite.' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Classer sans suite' })).toBeNull()
    expect(screen.getByText(card.snapshot)).toBeTruthy()
  })

  it('says a failure above its buttons, which stay to try again', async () => {
    await renderWithProviders(
      <ReportCard
        {...card}
        onView={jest.fn()}
        error="Une erreur inattendue est survenue."
        actions={[{ label: 'Classer sans suite', onPress: jest.fn() }]}
      />,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Classer sans suite' })).toBeTruthy()
  })

  describe('says which card each button acts on', () => {
    const description = 'Commentaire : Envoie-moi le code de ta carte…'
    const actions = [
      { label: 'Retirer', onPress: jest.fn(), tone: 'danger' as const },
      { label: 'Classer sans suite', onPress: jest.fn() },
    ]

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('as a hint read after the name, on a phone', async () => {
      await renderWithProviders(
        <ReportCard {...card} onView={jest.fn()} description={description} actions={actions} />,
      )

      const named = [
        screen.getByRole('link', { name: 'Voir' }),
        screen.getByRole('button', { name: 'Retirer' }),
        screen.getByRole('button', { name: 'Classer sans suite' }),
      ]
      expect(named.map((element) => element.props.accessibilityHint)).toEqual([
        description,
        description,
        description,
      ])
    })

    it('through aria-describedby and a hidden text, on the web', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      await renderWithProviders(
        <ReportCard {...card} onView={jest.fn()} description={description} actions={actions} />,
      )

      const named = [
        screen.getByRole('link', { name: 'Voir' }),
        screen.getByRole('button', { name: 'Retirer' }),
        screen.getByRole('button', { name: 'Classer sans suite' }),
      ]
      const ids = named.map((element) => element.props['aria-describedby'])
      expect(ids[0]).toEqual(expect.any(String))
      expect(new Set(ids).size).toBe(1)
      // Le texte désigné porte la description : le lecteur d'écran la lit après le nom.
      // Caché à la vue (display: none), le navigateur le lit quand même quand on le désigne.
      const described = screen.getByText(description, { includeHiddenElements: true })
      expect(described.props.nativeID).toBe(ids[0])
      // Sur le web, pas d'indice en plus : il serait lu deux fois.
      expect(named.map((element) => element.props.accessibilityHint)).toEqual([
        undefined,
        undefined,
        undefined,
      ])
    })
  })

  it('shows no precision at all when there is none', async () => {
    await renderWithProviders(<ReportCard {...card} details={[]} onView={jest.fn()} />)

    expect(screen.getByText(card.snapshot)).toBeTruthy() // témoin
    expect(screen.queryByText('Il a écrit la même chose sous trois projets.')).toBeNull()
  })
})
