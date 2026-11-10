// Une mise à jour d'exemple (R7a), telle que l'API la donne, pour les tests de l'appli : celle du
// parcours du scénario, « Le décompte de la fusée » (v1.2, une ligne « Nouveau », une « Réparé »,
// deux photos en avant / après).
import type { ProjectUpdate, UpdateSummary } from '@ruche/contracts'
import { photo } from './projects'

export const rocketUpdate: ProjectUpdate = {
  id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  title: 'Le décompte de la fusée',
  version: 'v1.2',
  lines: [
    { family: 'new', text: 'Un compte à rebours avant chaque question' },
    { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
  ],
  photos: [
    photo('55555555-5555-4555-8555-555555555555', 1600, 900, 'La fusée de jour'),
    photo('66666666-6666-4666-8666-666666666666', 1600, 900, 'La fusée de nuit'),
  ],
  beforeAfter: true,
  createdAt: '2026-10-19T09:00:00.000Z',
  removal: null,
}

/** La version courte d'une mise à jour, comme sur une carte du fil. */
export const summaryOfUpdate = (update: ProjectUpdate): UpdateSummary => {
  const [firstLine] = update.lines
  if (!firstLine) throw new Error('an update has at least one line')
  return {
    id: update.id,
    at: update.createdAt,
    version: update.version,
    firstLine,
    lineCount: update.lines.length,
  }
}
