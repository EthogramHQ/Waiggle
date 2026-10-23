// Tests du contrat des signalements et de la modération (tranche 7a) : ce qu'un membre peut
// envoyer pour signaler, ce que la file montre à l'administrateur, et surtout ce qu'elle ne montre
// jamais (qui a signalé). Scénario : docs/scenarios/phase-1.md, « Tranche 7a — Signaler » ; règles
// de la relecture du plan (22/10/2026), numérotées comme dans le plan.
import { describe, expect, it } from 'vitest'
import { AccountExport } from './export'
import { Notification } from './notifications'
import { Removal } from './removal'
import {
  CreateReport,
  MODERATION_DETAILS_SHOWN,
  ModerationDecisionInput,
  ModerationQueueItem,
  REPORT_DETAILS_MAX,
  RemovedItem,
  ReportExport,
  ReportReason,
  ReportTarget,
} from './reports'

const projectId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'
const commentId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f7'
const at = '2026-10-22T09:30:00.000Z'

describe('ReportTarget', () => {
  it('accepts the four kinds: a project, a note, a comment or a profile', () => {
    for (const target of [
      { kind: 'project', id: projectId },
      { kind: 'note', id: projectId },
      { kind: 'comment', id: commentId },
      { kind: 'member', id: 'Xy3_member-id' },
    ]) {
      expect(ReportTarget.parse(target), target.kind).toEqual(target)
    }
  })

  // Règle 6 : l'identifiant est validé selon la sorte, avant toute requête en base.
  it('validates the id according to the kind', () => {
    expect(ReportTarget.safeParse({ kind: 'project', id: 'not-a-uuid' }).success).toBe(false)
    expect(ReportTarget.safeParse({ kind: 'comment', id: 'Xy3_member-id' }).success).toBe(false)
    expect(ReportTarget.safeParse({ kind: 'member', id: '../admin' }).success).toBe(false)
    expect(ReportTarget.safeParse({ kind: 'member', id: '' }).success).toBe(false)
  })

  it('refuses an unknown kind', () => {
    expect(ReportTarget.safeParse({ kind: 'reaction', id: projectId }).success).toBe(false)
  })
})

describe('CreateReport', () => {
  const report = { target: { kind: 'project', id: projectId }, reason: 'scam_spam' }

  // Règle 8 : sept motifs, dont « privacy », le cas le plus probable entre proches.
  it('offers seven reasons, in order, privacy included', () => {
    expect(ReportReason.options).toEqual([
      'illegal',
      'harassment',
      'sexual_violent',
      'scam_spam',
      'impersonation',
      'privacy',
      'other',
    ])
    expect(CreateReport.safeParse({ ...report, reason: 'privacy' }).success).toBe(true)
    expect(CreateReport.safeParse({ ...report, reason: 'boring' }).success).toBe(false)
  })

  // Plan, règle 36 (article 16 du DSA) : un contenu dit illégal demande une explication.
  it('asks for an explanation when the content is said to be illegal', () => {
    for (const details of [undefined, '', '   ']) {
      expect(CreateReport.safeParse({ ...report, reason: 'illegal', details }).success).toBe(false)
    }
    expect(
      CreateReport.safeParse({ ...report, reason: 'illegal', details: 'Une adresse privée.' })
        .success,
    ).toBe(true)
    expect(CreateReport.safeParse({ ...report, reason: 'other' }).success).toBe(true)
  })

  it('takes optional details of 500 characters at most, trimmed', () => {
    expect(CreateReport.parse(report)).toEqual(report)
    expect(CreateReport.parse({ ...report, details: '  Le lien mène à une arnaque.  ' })).toEqual({
      ...report,
      details: 'Le lien mène à une arnaque.',
    })
    expect(
      CreateReport.safeParse({ ...report, details: 'a'.repeat(REPORT_DETAILS_MAX) }).success,
    ).toBe(true)
    expect(
      CreateReport.safeParse({ ...report, details: 'a'.repeat(REPORT_DETAILS_MAX + 1) }).success,
    ).toBe(false)
  })

  // Règle 7 : le texte visé est lu en base ; un `snapshot` envoyé par l'appli disparaît.
  it('never takes the reported text from the client', () => {
    const parsed = CreateReport.parse({ ...report, snapshot: 'Texte inventé par le client' })
    expect(JSON.stringify(parsed)).not.toContain('inventé')
  })
})

describe('ModerationQueueItem', () => {
  const item = {
    target: { kind: 'comment', id: commentId },
    projectId,
    snapshot: 'Le texte au moment du signalement',
    state: 'present',
    concernsMe: false,
    reasons: [
      { reason: 'harassment', count: 2 },
      { reason: 'other', count: 1 },
    ],
    details: ['Il insulte tout le monde.'],
    count: 3,
    firstReportedAt: '2026-10-21T09:30:00.000Z',
    lastReportedAt: at,
  }

  it('describes a target with its reasons counted, its details and its dates', () => {
    expect(ModerationQueueItem.parse(item)).toEqual(item)
  })

  // Règle 14 : un schéma strict, sans qui a signalé ; une clé de plus est refusée.
  it('refuses any field naming who reported, even nested', () => {
    expect(ModerationQueueItem.safeParse({ ...item, reporterId: 'zoe-id' }).success).toBe(false)
    expect(
      ModerationQueueItem.safeParse({
        ...item,
        reasons: [{ reason: 'harassment', count: 2, reporterId: 'zoe-id' }],
      }).success,
    ).toBe(false)
  })

  it('shows at most 20 details per target', () => {
    const details = (n: number) => Array.from({ length: n }, (_, i) => `précision ${i}`)
    expect(
      ModerationQueueItem.safeParse({ ...item, details: details(MODERATION_DETAILS_SHOWN) })
        .success,
    ).toBe(true)
    expect(
      ModerationQueueItem.safeParse({ ...item, details: details(MODERATION_DETAILS_SHOWN + 1) })
        .success,
    ).toBe(false)
  })

  it('counts at least one report', () => {
    expect(ModerationQueueItem.safeParse({ ...item, count: 0 }).success).toBe(false)
  })

  it('tells whether the target is present, removed or gone', () => {
    for (const state of ['present', 'removed', 'gone']) {
      expect(ModerationQueueItem.safeParse({ ...item, state }).success, state).toBe(true)
    }
    expect(ModerationQueueItem.safeParse({ ...item, state: 'deleted' }).success).toBe(false)
  })
})

describe('RemovedItem', () => {
  it('describes a removed content with its ground and explanation, and no administrator', () => {
    const item = {
      target: { kind: 'project', id: projectId },
      projectId,
      text: 'Météo — Une appli de météo.',
      ground: 'rules',
      explanation: 'Publicité déguisée.',
      removedAt: at,
      concernsMe: false,
    }
    expect(RemovedItem.parse(item)).toEqual(item)
    expect(RemovedItem.safeParse({ ...item, adminId: 'louis-id' }).success).toBe(false)
  })
})

describe('ModerationDecisionInput', () => {
  const target = { kind: 'project', id: projectId }

  // Règle 13 : un retrait porte un fondement (la loi ou les règles) et une explication.
  it('requires a ground and a visible explanation to remove', () => {
    const remove = { action: 'remove', target, ground: 'illegal', explanation: 'Contrefaçon.' }
    expect(ModerationDecisionInput.parse(remove)).toEqual(remove)
    const { ground: _g, ...withoutGround } = remove
    expect(ModerationDecisionInput.safeParse(withoutGround).success).toBe(false)
    const { explanation: _e, ...withoutExplanation } = remove
    expect(ModerationDecisionInput.safeParse(withoutExplanation).success).toBe(false)
    expect(ModerationDecisionInput.safeParse({ ...remove, explanation: '   ' }).success).toBe(false)
    expect(
      ModerationDecisionInput.safeParse({ ...remove, explanation: 'a'.repeat(501) }).success,
    ).toBe(false)
    expect(ModerationDecisionInput.safeParse({ ...remove, ground: 'mood' }).success).toBe(false)
  })

  it('dismisses or restores with the target alone', () => {
    for (const action of ['dismiss', 'restore']) {
      expect(ModerationDecisionInput.parse({ action, target }), action).toEqual({ action, target })
    }
    expect(ModerationDecisionInput.safeParse({ action: 'delete', target }).success).toBe(false)
  })
})

describe('Removal', () => {
  // Règle 14 : ce que l'auteur lit ne contient aucun identifiant d'administrateur.
  it('tells the author the ground, the explanation, the date and whether it followed a report', () => {
    const removal = { ground: 'rules', explanation: 'Publicité déguisée.', at, afterReport: true }
    expect(Removal.parse(removal)).toEqual(removal)
    const text = JSON.stringify(Removal.parse({ ...removal, adminId: 'louis-id' }))
    expect(text).not.toContain('louis-id')
  })
})

describe('the two notifications of moderation', () => {
  const removed = {
    id: 'removed:0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f8',
    at,
    isNew: true,
    kind: 'removed',
    targetKind: 'project',
    project: { id: projectId, title: 'Météo' },
    excerpt: null,
    ground: 'rules',
    explanation: 'Publicité déguisée.',
    afterReport: true,
  }
  const handled = {
    id: 'report:0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f9',
    at,
    isNew: true,
    kind: 'report_handled',
    targetKind: 'comment',
    outcome: 'removed',
    link: { projectId, memberId: null },
  }

  it('describes a removal, for its author, without the administrator nor the reporter', () => {
    expect(Notification.parse(removed)).toEqual(removed)
    const text = JSON.stringify(
      Notification.parse({ ...removed, adminId: 'louis-id', reporterId: 'zoe-id' }),
    )
    expect(text).not.toContain('louis-id')
    expect(text).not.toContain('zoe-id')
    // Un profil ne se retire pas : il se classe seulement.
    expect(Notification.safeParse({ ...removed, targetKind: 'member' }).success).toBe(false)
  })

  // Règle 2 : la sorte de cible et l'issue, rien d'autre ; un lien seulement si la cible se voit.
  it('describes a handled report with the kind and the outcome only', () => {
    expect(Notification.parse(handled)).toEqual(handled)
    expect(Notification.parse({ ...handled, link: null })).toEqual({ ...handled, link: null })
    const text = JSON.stringify(
      Notification.parse({
        ...handled,
        project: { id: projectId, title: 'Météo' },
        excerpt: 'Texte du commentaire',
        author: { id: 'malik-id', name: 'Malik' },
        explanation: 'Insulte.',
      }),
    )
    for (const leak of ['Météo', 'Texte du commentaire', 'malik', 'Insulte']) {
      expect(text, leak).not.toContain(leak)
    }
    expect(Notification.safeParse({ ...handled, outcome: 'void' }).success).toBe(false)
  })
})

describe('the reports in the export', () => {
  it('lists the reports made, without the reported text nor the explanation', () => {
    const report = {
      targetKind: 'project',
      targetId: projectId,
      reason: 'privacy',
      details: null,
      createdAt: at,
      outcome: 'dismissed',
      decidedAt: at,
    }
    expect(ReportExport.parse(report)).toEqual(report)
    const text = JSON.stringify(
      ReportExport.parse({ ...report, snapshot: 'Le texte visé', explanation: 'Pas contraire.' }),
    )
    expect(text).not.toContain('Le texte visé')
    expect(text).not.toContain('Pas contraire')
    expect(AccountExport.shape.reports).toBeDefined()
  })
})
