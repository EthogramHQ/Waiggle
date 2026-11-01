// Tests du salut d'accueil (R4, premier lancement) : les trois textes, le titre annoncé comme
// titre, et la mascotte cachée aux lecteurs d'écran (le titre dit déjà tout).
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Greeting } from './Greeting'

const texts = {
  hello: 'Bonjour Inès !',
  title: 'Ton fil t’attend',
  body: 'Suis des proches pour voir leurs projets ici.',
}

/** Le niveau du titre n'est écrit que sur le web (`aria-level`, une balise <h2>) : on s'y place. */
const headingLevelOnWeb = async (level?: 1 | 2) => {
  jest.replaceProperty(Platform, 'OS', 'web')
  try {
    await renderWithProviders(<Greeting {...texts} {...(level ? { level } : null)} />)
    return screen.getByRole('header', { name: texts.title }).props['aria-level']
  } finally {
    jest.restoreAllMocks()
  }
}

describe('Greeting', () => {
  it('says hello, then the title as a heading, then what to do', async () => {
    await renderWithProviders(<Greeting {...texts} />)

    expect(screen.getByText(texts.hello)).toBeTruthy()
    expect(screen.getByRole('header', { name: texts.title })).toBeTruthy()
    expect(screen.getByText(texts.body)).toBeTruthy()
  })

  it('gives the title level 2 on the web, under the page title', async () => {
    expect(await headingLevelOnWeb()).toBe(2)
  })

  it('takes another heading level when asked', async () => {
    expect(await headingLevelOnWeb(1)).toBe(1)
  })

  it('hides the mascot from screen readers', async () => {
    await renderWithProviders(<Greeting {...texts} />)

    // Témoin : la mascotte est bien dessinée, mais cachée (et donc introuvable par son rôle).
    expect(screen.getByRole('img', { hidden: true })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
