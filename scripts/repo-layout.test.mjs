// Tests du garde de la forme du dépôt (scripts/repo-layout.mjs), lancés par `node --test` :
// `pnpm test:scripts`, `pnpm check` et la CI. Les chemins sont écrits ici : aucun appel à Git.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layoutProblems } from './repo-layout.mjs'

describe('layoutProblems', () => {
  it('accepts the files the repository is meant to hold', () => {
    assert.deepEqual(
      layoutProblems([
        'README.md',
        'README.en.md',
        '.github/workflows/ci.yml',
        'apps/api/src/app.ts',
        'infra/.env.example',
        'docs/adr/0003-hebergement.md',
      ]),
      [],
    )
  })

  it('refuses a file or folder that is not expected at the root', () => {
    const problems = layoutProblems(['NOTES.md', '.vscode/settings.json', 'scratch.txt'])
    assert.equal(problems.length, 3)
    assert.match(problems[0], /^NOTES\.md : /)
    assert.match(problems[1], /^\.vscode\/settings\.json : /)
  })

  it('refuses a hidden folder inside the project', () => {
    const problems = layoutProblems(['apps/app/.idea/workspace.xml', '.github/.cache/x'])
    assert.equal(problems.length, 2)
    assert.match(problems[0], /dossier caché « \.idea »/)
    assert.match(problems[1], /dossier caché « \.cache »/)
  })

  it('still accepts a hidden file inside the project', () => {
    assert.deepEqual(layoutProblems(['infra/.env.example', 'apps/app/.gitignore']), [])
  })

  it('refuses a capitalised Markdown file outside the root', () => {
    const problems = layoutProblems([
      'apps/app/NOTES.md',
      'packages/i18n/TODO.local.md',
      'docs/guide.md',
    ])
    assert.equal(problems.length, 2)
    assert.match(problems[0], /« NOTES\.md » n'est prévu qu'à la racine/)
    assert.match(problems[1], /« TODO\.local\.md »/)
  })

  it('reports each wrong path once', () => {
    assert.equal(layoutProblems(['.local/NOTES.md']).length, 1)
  })
})
