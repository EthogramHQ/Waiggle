// Tests de la place gardée sous la carte de la page de sortie, sur ordinateur (correction après
// R7a) : la ligne des testeurs peut arriver avec la lecture du projet, et sa place est gardée sous
// la carte pour que « Ouvrir le site » ne remonte pas. Mais quand on arrive de la page du projet, sa
// lecture est déjà dans le cache : on sait dès l'arrivée si la ligne viendra. Un projet qui n'est
// pas « Testable » n'en aura jamais : aucune place n'a alors à être gardée (A3, S1).
//
// Jest ne mesure aucune position : ces tests vérifient la présence de la place ; la preuve que
// rien ne bouge et que la page ne défile pas est la mesure dans le navigateur.
import type { Project } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react-native'
import { type ReactNode, useState } from 'react'
import { getProject } from '../projects/api'
import { projectQueryKey } from '../projects/hooks'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { LeavingScreen } from './LeavingScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/out',
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: () => true,
  }),
}))

const OPEN = fr.t(($) => $.leaving.open)
const HOLD = 'card-hold'
const url = 'https://recettes.example.com'
const { id } = recipesProject

/** Le projet de Léa, vu par Inès, encore « En construction » : pas de ligne des testeurs. */
const building: Project = { ...recipesProject, status: 'building', isMine: false, isTester: false }

/**
 * La page du projet, quittée par « Tester la démo » : elle a laissé sa lecture dans le cache, que
 * la page de sortie reprend dès son premier dessin. Le cache est rempli avant que la page de
 * sortie ne se dessine (dans l'initialiseur d'un état, qui ne tourne qu'une fois).
 */
function FromProjectPage({ project, children }: { project: Project; children: ReactNode }) {
  const queryClient = useQueryClient()
  useState(() => queryClient.setQueryData(projectQueryKey(project.id), project))
  return children
}

const hold = () => screen.queryByTestId(HOLD, { includeHiddenElements: true })

let restoreWindow: () => void
beforeEach(() => {
  restoreWindow = setDesktopWindow()
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest.mocked(getProject).mockReset()
})
afterEach(() => restoreWindow())

describe('the room kept under the leaving card on a computer', () => {
  it('keeps the room while the project is still being read (a direct link)', async () => {
    // Témoin : la lecture n'a pas encore répondu, la ligne peut venir, la place est gardée.
    jest.mocked(getProject).mockReturnValue(new Promise(() => {}))
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(hold()).not.toBeNull()
  })

  it('keeps no room when the project read on its page cannot bring the line', async () => {
    // La page relit le projet en arrivant (le cache peut être ancien) : la même réponse.
    jest.mocked(getProject).mockResolvedValue(building)
    await renderWithProviders(
      <FromProjectPage project={building}>
        <LeavingScreen url={url} project={id} />
      </FromProjectPage>,
    )

    // Dès l'arrivée, puis une fois la relecture faite.
    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(hold()).toBeNull()
    await act(async () => {})
    expect(hold()).toBeNull()
  })
})
