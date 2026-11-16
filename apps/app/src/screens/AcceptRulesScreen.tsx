// L'écran « Accepter » (tranche R11, « La conformité » ; planches R11-Accepter et
// R11-Accepter-Desktop) : la garde des règles (`rules/RulesGate`) le pose au-dessus de tout tant que
// le membre n'a pas accepté la version en vigueur. Il y lit le titre des règles, « Ce qui change »
// quand la version a changé, l'« En bref » (les mêmes puces que la page /rules : une seule source,
// `legal/documents.ts`), un lien vers le texte complet, puis coche les deux cases et touche
// « Continuer ».
//
// Trois sorties restent, pour qui ne veut pas accepter : « Télécharger mes données » (sur place, la
// page « Mes données » restant fermée), « Supprimer mon compte » (une page ouverte sans accord) et
// « Me déconnecter ». Un membre suspendu y relit l'essentiel de sa suspension, que l'écran couvre
// (la mesure, sa fin, le recours), et qu'accepter ne la lève pas (relecture juridique du plan, J2).
//
// L'écran ne se ferme pas lui-même : après l'accord, le profil mis en cache dit
// `rulesAccepted: true`, et la garde s'efface.
//
// Mise en page : sur téléphone, le texte défile et le pied (le lien, les cases, « Continuer », les
// sorties) reste en bas, s'il tient dans la moitié de la fenêtre ; sur ordinateur, deux colonnes,
// le texte à gauche, les cases et les sorties à droite.
import { type Me, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadMyData } from '../accounts/api'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { legalDocument } from '../legal/documents'
import { useAcceptRules } from '../rules/api'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Columns } from '../ui/Columns'
import { type Focusable, focusAndReveal, focusWithoutScroll } from '../ui/focus'
import { KeyPoints } from '../ui/KeyPoints'
import { LegalVersionBadge } from '../ui/LegalDocument'
import { ListBlock, ListGroup } from '../ui/ListGroup'
import { Notice } from '../ui/Notice'
import { Screen } from '../ui/Screen'
import { Stack } from '../ui/Stack'
import { SuspensionBanner } from '../ui/SuspensionBanner'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { useLayout } from '../ui/theme/layout'
import { useCalmMotion } from '../ui/theme/motion'
import { useSignOut } from './settings/useSignOut'

/** Les paramètres des messages d'erreur du compte qui citent les longueurs du mot de passe. */
const lengths = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }

/** Ce qui manque encore quand « Continuer » est touché. */
type Missing = 'rules' | 'age' | 'both'

const missingOf = (rules: boolean, age: boolean): Missing | null =>
  !rules && !age ? 'both' : !rules ? 'rules' : !age ? 'age' : null

/**
 * Pourquoi l'accord n'a pas pu s'enregistrer (relecture de design de R11). Réessayer ne lève que
 * les pannes (`error`) : une session expirée (401) demande de se reconnecter, et une demande refusée
 * (400) vient d'un onglet resté ouvert sur une ancienne version des règles, la seule que l'API
 * refuse (`RULES_VERSION`) : il faut recharger la page pour lire la nouvelle.
 */
type Refusal = 'unauthorized' | 'outdated' | 'error'

const refusalOf = (key: ApiErrorKey): Refusal =>
  key === 'unauthorized' ? 'unauthorized' : key === 'validation' ? 'outdated' : 'error'

/**
 * Le pied collé seulement s'il prend au plus la moitié de la fenêtre (relecture du plan, U1) : plus
 * haut (petit téléphone, texte agrandi), il suit le texte.
 */
const FOOTER_MAX_SHARE = 0.5

export function AcceptRulesScreen({ me }: { me: Me }) {
  const { t } = useTranslation()
  const router = useRouter()
  const calm = useCalmMotion()
  const wide = useLayout().sizeClass === 'wide'
  // Les Règles telles que les montre /rules : leur version et leurs puces.
  const rules = legalDocument('rules', t)

  const [rulesChecked, setRulesChecked] = useState(false)
  const [ageChecked, setAgeChecked] = useState(false)
  // Le message posé au-dessus de « Continuer » : ce qui manque, ou l'accord refusé. Le dernier reste
  // jusqu'au toucher suivant (sinon « Continuer » remonterait sous le doigt à chaque case cochée).
  const [message, setMessage] = useState<Missing | Refusal | null>(null)
  const { accept, busy } = useAcceptRules()
  // Une seule demande à la fois, lue au toucher même : à la seconde tape, un état React ne serait
  // pas encore à jour.
  const sending = useRef(false)
  const rulesBox = useRef<Focusable>(null)
  const ageBox = useRef<Focusable>(null)
  // Le focus du clavier part du titre (relecture du plan, U1). Le piège à focus de la fenêtre (web)
  // prendrait sinon le premier élément focalisable, qui sur téléphone est la zone qui défile tout
  // entière (Chrome rend une zone qui défile atteignable au clavier) ; il garde un focus déjà posé
  // dans la couche. Une fois, à l'arrivée de l'écran.
  const titleRef = useRef<Focusable>(null)
  useEffect(() => {
    focusWithoutScroll(titleRef.current)
  }, [])

  const onContinue = async () => {
    if (sending.current) return
    const missing = missingOf(rulesChecked, ageChecked)
    setMessage(missing)
    if (missing) {
      // Le focus va à la première case à cocher, amenée dans l'écran (envoi refusé avant de partir).
      focusAndReveal(missing === 'age' ? ageBox.current : rulesBox.current, calm)
      return
    }
    sending.current = true
    try {
      await accept()
    } catch (error) {
      setMessage(refusalOf(errorKey(error)))
    } finally {
      sending.current = false
    }
  }

  // « Télécharger mes données », sur place : l'écran reste, un message dit le résultat.
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<{ text: string; ok: boolean } | null>(null)
  const onExport = async () => {
    if (exporting) return
    setExporting(true)
    setExported(null)
    const result = await downloadMyData()
    setExporting(false)
    setExported(
      result.ok
        ? { text: t(($) => $.account.export.done), ok: true }
        : { text: t(($) => $.auth.errors[result.error], lengths), ok: false },
    )
  }
  const signOut = useSignOut()

  // « Ce qui change » : les phrases des clés connues de cette version de l'appli, dans l'ordre de
  // l'API. Une clé inconnue dit que les règles sont plus récentes que l'appli (un onglet resté
  // ouvert) : ses textes sont anciens, et l'API refuserait l'accord ; l'écran dit de recharger.
  // `returnObjects` : la section entière (`{ clé: phrase }`), que le typage croit être un texte ;
  // vide, elle peut revenir sous la forme de son chemin : aucune clé n'y est alors trouvée.
  const phrases = t(($) => $.rules.changes, { returnObjects: true }) as unknown as Record<
    string,
    unknown
  >
  const changes = me.rulesChanges.flatMap((key) => {
    const phrase = phrases[key]
    return typeof phrase === 'string' ? [phrase] : []
  })
  const outdated = changes.length < me.rulesChanges.length

  const missingText =
    message === 'rules'
      ? t(($) => $.rules.missing.rules)
      : message === 'age'
        ? t(($) => $.rules.missing.age)
        : message === 'both'
          ? t(($) => $.rules.missing.both)
          : message === 'unauthorized'
            ? t(($) => $.errors.unauthorized)
            : message === 'outdated'
              ? t(($) => $.rules.outdated)
              : message === 'error'
                ? t(($) => $.rules.error)
                : null

  const readFull = (
    <TextLink
      role="link"
      label={t(($) => $.rules.readFull)}
      onPress={() => router.push('/rules')}
    />
  )

  const text = (
    // Une colonne de lecture (`readable`) : sur ordinateur, l'« En bref » garde la largeur du texte
    // des Règles, au lieu de s'étirer sur toute la colonne (relecture de design de R11).
    <Stack gap="xl" readable>
      {me.suspension ? (
        // J2 : la suspension, dépliée (la mesure, sa fin à l'heure de Paris, le recours), puis ce
        // qu'accepter ne change pas.
        <Stack gap="sm">
          <SuspensionBanner suspension={me.suspension} initiallyOpen />
          <Text variant="callout" weight={600}>
            {t(($) => $.rules.suspended)}
          </Text>
        </Stack>
      ) : null}
      <LegalVersionBadge version={rules.version} />
      {changes.length > 0 ? (
        <ListGroup title={t(($) => $.rules.changesTitle)}>
          <ListBlock>
            <KeyPoints points={changes.map((phrase) => ({ icon: 'sparkle', text: phrase }))} />
          </ListBlock>
        </ListGroup>
      ) : outdated ? (
        // Aucune phrase connue de cette version de l'appli : le titre, sans le cadre vide d'une liste.
        <Text variant="headline" heading={2}>
          {t(($) => $.rules.changesTitle)}
        </Text>
      ) : null}
      {outdated ? (
        // `polite` : présente dès l'arrivée, elle n'interrompt pas la lecture du titre.
        <Notice tone="info" polite message={t(($) => $.rules.outdated)} />
      ) : null}
      <ListGroup title={t(($) => $.legal.summaryTitle)}>
        <ListBlock>
          <KeyPoints points={rules.summary} />
        </ListBlock>
      </ListGroup>
      {wide ? readFull : null}
    </Stack>
  )

  const agreement: ReactNode = (
    <Stack gap="md">
      {wide ? null : readFull}
      <Stack gap="xs">
        <Checkbox
          ref={rulesBox}
          label={t(($) => $.rules.accept)}
          value={rulesChecked}
          onValueChange={setRulesChecked}
        />
        <Checkbox
          ref={ageBox}
          label={t(($) => $.rules.age)}
          value={ageChecked}
          onValueChange={setAgeChecked}
        />
      </Stack>
      {missingText ? <Notice tone="error" message={missingText} /> : null}
      <Button label={t(($) => $.rules.continue)} loading={busy} onPress={() => void onContinue()} />
      <Stack gap="xs">
        <TextLink
          role="button"
          tone="muted"
          label={t(($) => $.account.export.button)}
          disabled={exporting}
          onPress={() => void onExport()}
        />
        {exported ? (
          <Notice tone={exported.ok ? 'success' : 'error'} message={exported.text} />
        ) : null}
        <TextLink
          role="button"
          tone="muted"
          label={t(($) => $.account.signOut)}
          onPress={() => void signOut.signOut()}
        />
        {signOut.failed ? <Notice tone="error" message={t(($) => $.account.signOutError)} /> : null}
        <TextLink
          role="link"
          tone="muted"
          label={t(($) => $.account.delete.title)}
          onPress={() => router.push('/settings/account/delete')}
        />
      </Stack>
    </Stack>
  )

  return (
    <Screen
      title={rules.title}
      titleRef={titleRef}
      width={wide ? 'page' : 'form'}
      footer={wide ? undefined : agreement}
      footerMaxShare={FOOTER_MAX_SHARE}
    >
      {wide ? <Columns main={text} side={agreement} /> : text}
    </Screen>
  )
}
