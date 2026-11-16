// La feuille « Créer une ruche » (R10, docs/scenarios/refonte.md, « Créer une ruche », planche
// R10-Creer) : le nom de la ruche (40 caractères au plus), l'une des douze icônes posée dans
// l'alvéole miel, l'aperçu « Ma ruche Famille », puis « Créer ».
//
// La feuille a sa propre adresse, `/hives/new` (`app/hives/new.tsx`, `sheetRoute` dans
// `app/_layout.tsx`), posée sur l'onglet Ruches ; la fermer y revient (`useRouteSheet`, repli
// `/hives` quand on arrive par un lien direct).
//
// - Le nom se vérifie comme le serveur le vérifie (`HiveName` du contrat : espaces retirés aux deux
//   bouts, 1 à 40 caractères, ni caractère invisible ni changement de sens d'écriture). Un nom vide,
//   ou fait seulement d'espaces, est refusé sous le champ, qui reprend le focus ; rien ne part.
// - « Créer » part une seule fois (deux tapes rapides n'envoient qu'une demande : `inFlight`, une
//   `ref` lue avant que React redessine). Pendant la création, rien ne ferme la feuille : ni
//   « Annuler », ni la croix, ni Échap, ni le voile (`busy`), ni le Retour du navigateur ou du
//   téléphone (`useLeaveGuard`) ; sinon la ruche serait créée derrière une feuille fermée.
// - Créée : la page de la nouvelle ruche (« Ta ruche est prête ») remplace la feuille
//   (`router.replace`) : le Retour ne ramène pas à une feuille déjà servie.
// - Refusée : la raison au pied de la feuille, au-dessus des boutons (les limites de 10 ruches
//   créées et de 20 ruches rejointes, le quota, la suspension, la session expirée avec « Me
//   reconnecter », sinon « Réessaie ») ; le nom et l'icône restent.
// - Avant d'envoyer, fermer ne demande rien (décision du plan R10, « Ce qui change au plan » 15) :
//   un nom et une icône se retapent en un instant.
import { HIVE_NAME_MAX, type HiveIcon, HiveName } from '@ruche/contracts'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ApiErrorKey, errorKey } from '../api/errors'
import { useCreateHive } from '../hives/api'
import { useSignInAgain } from '../navigation/signInAgain'
import { useLeaveGuard } from '../navigation/useLeaveGuard'
import { useRouteSheet } from '../navigation/useRouteSheet'
import { Button } from '../ui/Button'
import { HiveBadge } from '../ui/HiveBadge'
import { HiveIconPicker } from '../ui/HiveIconPicker'
import { Sheet, type SheetNotice } from '../ui/Sheet'
import { Row, Stack } from '../ui/Stack'
import { Surface } from '../ui/Surface'
import { Text } from '../ui/Text'
import { TextField, type TextFieldInput } from '../ui/TextField'

/** Pourquoi le nom est refusé avant l'envoi : vide, trop long, ou fait de caractères refusés. */
type NameProblem = 'required' | 'tooLong' | 'invalid'

/** L'icône de départ : la maison, comme sur la planche. */
const FIRST_ICON: HiveIcon = 'house-line'

export function HiveCreateSheet() {
  const { t } = useTranslation()
  const router = useRouter()
  const signInAgain = useSignInAgain()
  // Ouverte une fois la page hydratée et tant que l'adresse est la sienne ; fermée, elle revient à
  // l'onglet Ruches (la page d'avant, ou `/hives` après un lien direct).
  const sheet = useRouteSheet('/hives')
  const { mutateAsync } = useCreateHive()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState<HiveIcon>(FIRST_ICON)
  const [nameProblem, setNameProblem] = useState<NameProblem | null>(null)
  // Le refus de l'API, gardé jusqu'au prochain envoi (rien ne saute au-dessus des boutons).
  const [failure, setFailure] = useState<ApiErrorKey | null>(null)
  const [sending, setSending] = useState(false)
  // Vrai dès la tape sur « Créer », avant même que React redessine : une seconde tape n'envoie rien.
  const inFlight = useRef(false)
  // La saisie du nom : le focus y va à l'ouverture, et y revient quand le nom est refusé.
  const nameInput = useRef<TextFieldInput>(null)

  // Pendant la création, le Retour du navigateur ou du téléphone est arrêté, sans question : la
  // demande est partie, la réponse dira si la ruche existe. Avant, rien n'est gardé.
  const guard = useLeaveGuard(sending, () => {})
  const requestClose = () => {
    if (inFlight.current) return
    // Sur le web, la fermeture attend que l'étape de plus de l'historique soit retirée (aucune,
    // ici, hors de l'envoi : la fermeture part aussitôt).
    void guard.release().then(sheet.close)
  }

  const changeName = (text: string) => {
    setName(text)
    // Le nom retapé : le message d'avant n'a plus lieu d'être (il revient au prochain envoi).
    if (nameProblem) setNameProblem(null)
  }

  const submit = async () => {
    if (inFlight.current) return
    // La règle du contrat, comme le serveur la lit : il n'y a rien à envoyer qu'il refuserait.
    const checked = HiveName.safeParse(name)
    if (!checked.success) {
      const trimmed = name.trim()
      setNameProblem(
        trimmed === '' ? 'required' : trimmed.length > HIVE_NAME_MAX ? 'tooLong' : 'invalid',
      )
      nameInput.current?.focus()
      return
    }
    setNameProblem(null)
    inFlight.current = true
    setSending(true)
    try {
      const hive = await mutateAsync({ name: checked.data, icon })
      // La ruche existe : sa page remplace la feuille. L'étape d'historique de l'envoi est retirée
      // d'abord (web), puis l'adresse change : la feuille, qui n'est plus à son adresse, se ferme.
      await guard.release()
      router.replace({ pathname: '/hives/[id]', params: { id: hive.id } })
    } catch (error) {
      setFailure(errorKey(error))
      inFlight.current = false
      setSending(false)
    }
  }

  const nameMessage =
    nameProblem === 'required'
      ? t(($) => $.hives.createSheet.nameRequired)
      : nameProblem === 'tooLong'
        ? t(($) => $.hives.createSheet.nameHint)
        : nameProblem === 'invalid'
          ? t(($) => $.profile.errors.invalidCharacters)
          : undefined

  const notice: SheetNotice | null = failure ? noticeFor(failure) : null
  function noticeFor(key: ApiErrorKey): SheetNotice {
    if (key === 'unauthorized')
      return { message: t(($) => $.states.expired), action: signInAgain() }
    // Les limites : la phrase de l'onglet Ruches, qui dit quoi faire (en supprimer, en quitter une).
    if (key === 'hivesCreatedLimit') return { message: t(($) => $.hives.createdLimit) }
    if (key === 'hivesJoinedLimit') return { message: t(($) => $.hives.joinedLimit) }
    if (key === 'rateLimited' || key === 'suspended') return { message: t(($) => $.errors[key]) }
    return { message: t(($) => $.hives.createSheet.error) }
  }

  // L'aperçu : le nom tapé, ou, tant qu'il est vide, l'exemple du champ (« Famille »), en gris.
  const typed = name.trim()
  const shownName = typed === '' ? t(($) => $.hives.createSheet.namePlaceholder) : typed

  return (
    <Sheet
      open={sheet.open}
      title={t(($) => $.hives.createSheet.title)}
      // La feuille est la page (son adresse) : son titre est celui de la page.
      heading={1}
      // Dans l'appli, la feuille a la hauteur de son contenu (option 3 des planches R10).
      compact
      // La feuille s'ouvre sous le doigt de « Créer une ruche » : la seconde tape d'une double tape
      // ne tombe ni sur « Annuler » ni sur « Créer ».
      guardTaps
      initialFocusRef={nameInput}
      busy={sending}
      notice={notice}
      onClose={requestClose}
      footer={
        <Row gap="sm" justify="end" wrap>
          <Button
            label={t(($) => $.hives.createSheet.cancel)}
            variant="secondary"
            onPress={requestClose}
            disabled={sending}
          />
          <Button
            label={t(($) => $.hives.createSheet.submit)}
            onPress={() => void submit()}
            loading={sending}
          />
        </Row>
      }
    >
      <Stack gap="xl">
        <TextField
          label={t(($) => $.hives.createSheet.name)}
          value={name}
          onChangeText={changeName}
          placeholder={t(($) => $.hives.createSheet.namePlaceholder)}
          // Une limite affichée, pas un `maxLength` qui couperait en silence un nom collé trop long :
          // le compteur (« 7 / 40 », comme la planche) se voit toujours, le refus vient à l'envoi.
          limit={HIVE_NAME_MAX}
          showCount
          error={nameMessage}
          inputRef={nameInput}
          autoCapitalize="sentences"
          returnKeyType="done"
          // Entrée dans le champ : comme « Créer ».
          onSubmitEditing={() => void submit()}
        />

        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted" heading={2}>
            {t(($) => $.hives.createSheet.icon)}
          </Text>
          <HiveIconPicker value={icon} onChange={setIcon} disabled={sending} />
        </Stack>

        <Stack gap="sm">
          <Text variant="caption" weight={600} tone="muted" heading={2}>
            {t(($) => $.hives.createSheet.preview)}
          </Text>
          <Surface variant="plain" padding="md">
            {/* L'en-tête de la future page, lu d'un seul nom : « Ruche Famille ». */}
            <Row
              gap="md"
              accessibilityRole="group"
              accessibilityLabel={t(($) => $.hives.myHiveNamed, { hive: shownName })}
            >
              <HiveBadge icon={icon} name={shownName} size={64} />
              <Stack gap="xxs" grow>
                <Text
                  variant="title1"
                  // Un nom de 40 lettres sans espace, en grand, à 320 points : coupé plutôt que de
                  // sortir de la feuille.
                  breakAnywhere
                  {...(typed === '' ? { tone: 'muted' as const } : null)}
                >
                  {shownName}
                </Text>
              </Stack>
            </Row>
          </Surface>
        </Stack>
      </Stack>
    </Sheet>
  )
}
