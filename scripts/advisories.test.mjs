// Tests du guetteur d'avis de sécurité (scripts/advisories.mjs), lancés par `node --test` :
// `pnpm test:scripts`, `pnpm check` et la CI (tâche « Dependency audit »). Les avis et le verrou
// sont des données d'essai écrites ici : aucun appel réseau.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findAffected, inRange, lockedVersions, repoOf, sortFindings } from './advisories.mjs'

// Un morceau de pnpm-lock.yaml, dans sa forme réelle (version 9).
const LOCK = `---
lockfileVersion: '9.0'

importers:

  apps/api:
    dependencies:
      better-auth:
        specifier: 1.7.13
        version: 1.7.13(react@19.2.3)

packages:

  '@better-auth/core@1.7.13':
    resolution: {integrity: sha512-x}

  better-auth@1.7.13:
    resolution: {integrity: sha512-y}

  hono@4.13.17:
    resolution: {integrity: sha512-z}

snapshots:

  better-auth@1.7.13(react@19.2.3):
    dependencies:
      hono: 4.13.17
`

const advisory = (overrides = {}) => ({
  ghsa_id: 'GHSA-test-0000-0001',
  html_url: 'https://github.com/better-auth/better-auth/security/advisories/GHSA-test-0000-0001',
  summary: 'Prise de compte',
  severity: 'critical',
  withdrawn_at: null,
  vulnerabilities: [
    {
      package: { ecosystem: 'npm', name: 'better-auth' },
      vulnerable_version_range: '< 1.7.16',
      patched_versions: '1.7.16',
    },
  ],
  ...overrides,
})

const TODAY = '2026-11-07'
const run = (advisories, accepted = []) =>
  findAffected({ advisories, locked: lockedVersions(LOCK), accepted, today: TODAY })

describe('inRange', () => {
  it('reads the ranges written by GitHub', () => {
    assert.equal(inRange('1.7.13', '< 1.7.16'), true)
    assert.equal(inRange('1.7.16', '< 1.7.16'), false)
    assert.equal(inRange('1.7.13', '>= 1.0.0, < 1.7.16'), true)
    assert.equal(inRange('0.9.0', '>= 1.0.0, < 1.7.16'), false)
    assert.equal(inRange('4.13.15', '<= 4.13.15'), true)
    assert.equal(inRange('2.1.5', '= 2.1.5'), true)
    assert.equal(inRange('2.1.6', '2.1.5'), false)
    assert.equal(inRange('v2.11.7', '>= 2.0.0, < 2.11.8'), true)
  })

  it('also reads conditions separated by spaces only', () => {
    assert.equal(inRange('1.5.0', '>=1.3.0 < 1.10.1'), true)
    assert.equal(inRange('2.1.5', '>=1.3.0 < 1.10.1'), false)
    assert.equal(inRange('18.1.1', '> 1.1.1 < 2.0.0'), false)
  })

  it('puts a pre-release before its release', () => {
    assert.equal(inRange('1.7.16-beta.1', '< 1.7.16'), true)
    assert.equal(inRange('1.7.16', '< 1.7.16-beta.1'), false)
  })
})

describe('lockedVersions', () => {
  it('lists every version of every package in the lock file', () => {
    const locked = lockedVersions(LOCK)
    assert.deepEqual([...(locked.get('better-auth') ?? [])], ['1.7.13'])
    assert.deepEqual([...(locked.get('@better-auth/core') ?? [])], ['1.7.13'])
    assert.deepEqual([...(locked.get('hono') ?? [])], ['4.13.17'])
  })
})

describe('findAffected', () => {
  it('turns red on a critical advisory that a locked version is exposed to', () => {
    const findings = run([advisory()])

    assert.equal(findings.length, 1)
    assert.equal(findings[0]?.red, true)
    assert.equal(findings[0]?.version, '1.7.13')
    assert.equal(findings[0]?.patched, '1.7.16')
  })

  it('says nothing once the locked version is patched', () => {
    const patched = advisory({
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'hono' },
          vulnerable_version_range: '< 4.13.16',
          patched_versions: '4.13.16',
        },
      ],
    })

    assert.deepEqual(run([patched]), [])
  })

  it('trusts the patched version of the same major line over a range written too wide', () => {
    // Deux formes vues dans de vrais avis : une plage sans borne haute (« >= 4.12.0 », corrigé en
    // 4.12.2), et un avis à deux lignes de versions, dont la plage de la seconde (1.0 bêta)
    // contient aussi les versions 0.x déjà corrigées par la première.
    const tooWide = advisory({
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'hono' },
          vulnerable_version_range: '>= 4.12.0',
          patched_versions: '4.12.2',
        },
      ],
    })
    const twoLines = advisory({
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'better-auth' },
          vulnerable_version_range: '<= 1.7.12',
          patched_versions: '1.7.13',
        },
        {
          package: { ecosystem: 'npm', name: 'better-auth' },
          vulnerable_version_range: '<= 2.0.0-beta.19',
          patched_versions: '2.0.0-beta.20',
        },
      ],
    })

    assert.deepEqual(run([tooWide, twoLines]), [])
  })

  it('stays red on a flaw that came back after an older fix', () => {
    // GHSA-fmh4 de Better Auth : corrigé en 1.6.11, revenu en 1.6.14, corrigé de nouveau en 1.7.16.
    const cameBack = advisory({
      severity: 'high',
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'better-auth' },
          vulnerable_version_range: '< 1.6.11',
          patched_versions: '1.6.11',
        },
        {
          package: { ecosystem: 'npm', name: 'better-auth' },
          vulnerable_version_range: '>= 1.6.14, < 1.7.16',
          patched_versions: '1.7.16',
        },
      ],
    })

    const findings = run([cameBack])

    assert.equal(findings.length, 1)
    assert.equal(findings[0]?.red, true)
  })

  it('lists a moderate advisory without turning red', () => {
    const findings = run([advisory({ severity: 'medium' })])

    assert.equal(findings.length, 1)
    assert.equal(findings[0]?.red, false)
  })

  it('accepts a known advisory until the date written next to it, then turns red again', () => {
    const accepted = [
      {
        ghsa: 'GHSA-test-0000-0001',
        package: 'better-auth',
        reason: 'route fermée',
        until: '2026-11-13',
      },
    ]

    const before = findAffected({
      advisories: [advisory()],
      locked: lockedVersions(LOCK),
      accepted,
      today: '2026-11-13',
    })
    const after = findAffected({
      advisories: [advisory()],
      locked: lockedVersions(LOCK),
      accepted,
      today: '2026-11-14',
    })

    assert.equal(before[0]?.red, false)
    assert.equal(before[0]?.accepted?.reason, 'route fermée')
    assert.equal(after[0]?.red, true)
    assert.equal(after[0]?.expired, true)
  })

  it('ignores a withdrawn advisory, and one about a package we do not have', () => {
    const elsewhere = advisory({
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: '@better-auth/stripe' },
          vulnerable_version_range: '< 9.0.0',
          patched_versions: '9.0.0',
        },
      ],
    })

    assert.deepEqual(run([advisory({ withdrawn_at: '2026-11-05T00:00:00Z' }), elsewhere]), [])
  })

  it('puts the red findings first', () => {
    const findings = sortFindings(
      run([
        advisory({ severity: 'low', ghsa_id: 'GHSA-low' }),
        advisory({ severity: 'high', ghsa_id: 'GHSA-high' }),
      ]),
    )

    assert.deepEqual(
      findings.map((finding) => finding.ghsa),
      ['GHSA-high', 'GHSA-low'],
    )
  })
})

describe('repoOf', () => {
  it('finds the GitHub repository of a package, whatever the way it is written', () => {
    assert.equal(repoOf({ repository: 'github:honojs/hono' }), 'honojs/hono')
    assert.equal(repoOf({ repository: 'honojs/hono' }), 'honojs/hono')
    assert.equal(
      repoOf({
        repository: {
          url: 'git+https://github.com/better-auth/better-auth.git',
          directory: 'packages/better-auth',
        },
      }),
      'better-auth/better-auth',
    )
    assert.equal(repoOf({ repository: 'git://github.com/markedjs/marked.git' }), 'markedjs/marked')
    assert.equal(repoOf({ repository: 'https://gitlab.com/x/y' }), null)
    assert.equal(repoOf({}), null)
  })
})
