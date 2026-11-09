// Tests du choix du message de la feuille de publication (`formNoticeKind`, sorti de l'écran après
// les relectures de R6a, ui-C6) : un seul message à la fois, le plus urgent d'abord.
import { FORM_NOTICE_TONES, type FormNoticeState, formNoticeKind } from './form'

/** Un formulaire de création sans rien à dire. */
const quiet: FormNoticeState = {
  message: false,
  photosCut: false,
  photoProblem: null,
  portraitProblem: false,
  uploadFailed: false,
  editing: false,
  preparing: false,
  dirty: true,
}

describe('formNoticeKind', () => {
  it('says nothing on a new form with nothing going on', () => {
    expect(formNoticeKind(quiet)).toBeNull()
  })

  it('puts the message of the last send above every other notice', () => {
    expect(
      formNoticeKind({
        ...quiet,
        message: true,
        photosCut: true,
        photoProblem: 'other',
        portraitProblem: true,
        preparing: true,
      }),
    ).toBe('message')
  })

  it('then the photos: cut, a description that failed, another problem, then the portrait', () => {
    const all = { ...quiet, photosCut: true, photoProblem: 'describeFailed' as const }
    expect(formNoticeKind({ ...all, portraitProblem: true })).toBe('photosCut')
    expect(formNoticeKind({ ...all, photosCut: false, portraitProblem: true })).toBe(
      'describeFailed',
    )
    expect(formNoticeKind({ ...quiet, photoProblem: 'other', portraitProblem: true })).toBe(
      'photoProblem',
    )
    expect(formNoticeKind({ ...quiet, portraitProblem: true, preparing: true })).toBe(
      'portraitProblem',
    )
  })

  it('tells about missing photos only when editing just after a publication', () => {
    expect(formNoticeKind({ ...quiet, uploadFailed: true })).toBeNull()
    expect(formNoticeKind({ ...quiet, uploadFailed: true, editing: true, dirty: false })).toBe(
      'uploadFailed',
    )
  })

  it('says « preparing » only on a new project, and « unchanged » only when editing', () => {
    expect(formNoticeKind({ ...quiet, preparing: true })).toBe('preparing')
    expect(formNoticeKind({ ...quiet, preparing: true, editing: true })).toBeNull()
    expect(formNoticeKind({ ...quiet, editing: true, dirty: false })).toBe('unchanged')
    expect(formNoticeKind({ ...quiet, dirty: false })).toBeNull()
  })

  it('reads the problems as errors, and the states as polite information', () => {
    expect(FORM_NOTICE_TONES.message).toEqual({ tone: 'error' })
    expect(FORM_NOTICE_TONES.portraitProblem).toEqual({ tone: 'error' })
    expect(FORM_NOTICE_TONES.uploadFailed).toEqual({ tone: 'info' })
    expect(FORM_NOTICE_TONES.preparing).toEqual({ tone: 'info', polite: true })
    expect(FORM_NOTICE_TONES.unchanged).toEqual({ tone: 'info', polite: true })
  })
})
