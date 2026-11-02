// Le bloc « Le prompt de départ » de la page projet (tranche R5a, F-Pr2, F-Pr10, F-Mod4) : le premier
// prompt du projet en chasse fixe, son bouton « Copier », la phrase de prudence, et les autres
// prompts repliés sous « Les autres prompts · N ».
//
// Trois règles, venues des relectures du plan :
// - un seul texte pour afficher, repérer et copier : le prompt nettoyé par `cleanPrompt` du contrat
//   (sec-B1). Un prompt plus ancien qui contiendrait encore des caractères invisibles est montré,
//   examiné et copié sans eux : ce qu'on copie est exactement ce qu'on a lu ;
// - un repère « À lire avant de l'utiliser » dit ce qu'il a trouvé (une commande, un lien…), jamais
//   une intention, et la phrase de prudence s'affiche toujours, repère ou non (jur-6, jur-7) : un
//   prompt sans repère n'est pas pour autant sans danger ;
// - « Copié » et la bulle « Prompt copié » seulement si la copie a vraiment réussi (ui-7) ; sinon une
//   phrase d'échec, affichée sous le bouton et lue par les lecteurs d'écran.

import { radii, readableWidth, space } from '@ruche/brand'
import { cleanPrompt } from '@ruche/contracts'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { Callout } from './Callout'
import { CodeBlock } from './CodeBlock'
import { copyText } from './clipboard'
import { Disclosure } from './Disclosure'
import { Icon } from './Icon'
import { type PromptWarning, promptWarnings } from './promptWarnings'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'
import { useToast } from './theme/toast'

/** Le temps pendant lequel le bouton dit « Copié », avant de redevenir « Copier ». */
const COPIED_MS = 2_000

/** Une fonction de copie : rend vrai si le texte est dans le presse-papiers. */
type Copy = (text: string) => Promise<boolean>

type Props = {
  /** Les prompts du projet, dans leur ordre : le premier est « le prompt de départ ». */
  prompts: readonly string[]
  /**
   * La copie, `copyText` par défaut. Le catalogue en passe une autre pour montrer l'état « copie
   * refusée », qu'aucun navigateur ne donne sur commande.
   */
  copy?: Copy
}

export function PromptBlock({ prompts, copy = copyText }: Props) {
  const { t } = useTranslation()
  // Nettoyés une fois : c'est ce texte qui est affiché, repéré et copié (sec-B1).
  const cleaned = prompts.map(cleanPrompt)
  const [starting, ...others] = cleaned
  // Pas de prompt, pas de section : ni titre, ni prudence.
  if (starting === undefined) return null

  // La prudence est une phrase à lire : bornée à `readableWidth` comme le Markdown, elle garde une
  // longueur de ligne confortable (une centaine de caractères sur un grand écran, sinon). Posée à
  // gauche, dans la colonne du prompt : le bloc de code, lui, garde toute la largeur.
  const caution = (
    <View style={{ maxWidth: readableWidth }}>
      <Callout tone="caution" icon="info" title={t(($) => $.project.prompts.caution)} />
    </View>
  )

  return (
    <View style={{ gap: space.md }}>
      {/* Un titre de niveau 2 : une section de la page projet, sous son titre (ui-15). */}
      <Text variant="heading" heading={2}>
        {t(($) => $.project.prompts.starting)}
      </Text>
      <PromptItem
        text={starting}
        copyLabel={t(($) => $.project.prompts.copyStarting)}
        copiedLabel={t(($) => $.project.prompts.copiedStarting)}
        copy={copy}
      />
      {caution}
      {others.length > 0 ? (
        // Sans pastille (`icon={null}`) : un contenu secondaire, qui ne doit pas appeler l'œil.
        <Disclosure
          title={t(($) => $.project.prompts.others, { count: others.length })}
          icon={null}
        >
          {/* La prudence aussi en tête des autres prompts (jur-6) : on peut les copier sans avoir
              relu celle du prompt de départ. */}
          {caution}
          {others.map((text, rank) => (
            // Le rang comme clé : deux prompts peuvent avoir le même texte, et la liste ne change
            // pas d'ordre pendant qu'on la lit.
            <PromptItem
              // biome-ignore lint/suspicious/noArrayIndexKey: liste figée, textes possiblement en double
              key={rank}
              text={text}
              // Le 2e prompt de la liste est le premier des « autres » : son numéro est rang + 2.
              copyLabel={t(($) => $.project.prompts.copyNamed, { index: rank + 2 })}
              copiedLabel={t(($) => $.project.prompts.copiedNamed, { index: rank + 2 })}
              copy={copy}
            />
          ))}
        </Disclosure>
      ) : null}
    </View>
  )
}

/** Un prompt : ses repères, son texte en chasse fixe, et son bouton « Copier ». */
function PromptItem({
  text,
  copyLabel,
  copiedLabel,
  copy,
}: {
  text: string
  copyLabel: string
  copiedLabel: string
  copy: Copy
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const warnings = promptWarnings(text)
  // L'identifiant des repères, pour les relier au bouton « Copier » (aria-describedby sur le web) :
  // qui arrive au bouton au clavier entend aussi ce qu'il faut lire avant de copier.
  const warningsId = useId()
  const reasons = warnings.map((warning) => reasonText(t, warning))
  const warningLabel = t(($) => $.project.prompts.warning)

  return (
    <View style={{ gap: space.sm }}>
      {/* Les repères et le texte dans une même carte grise : le repère se lit avec ce qu'il
          décrit. La carte a le fond du bloc de code, qui s'y fond sans bordure. */}
      <View style={{ backgroundColor: colors.surfaceGrouped, borderRadius: radii.code }}>
        {warnings.length > 0 ? (
          <View
            nativeID={warningsId}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: space.sm,
              paddingTop: space.md,
              paddingHorizontal: space.md,
            }}
          >
            {/* La pastille ambre : le titre du repère. flexShrink et maxWidth : à 320 points et
                200 % de texte, elle passe à la ligne au lieu de sortir de la carte. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                flexShrink: 1,
                maxWidth: '100%',
                minHeight: 26,
                paddingHorizontal: space.sm,
                paddingVertical: space.xxs,
                // Rayon de panneau et non de pilule : à 200 %, le texte passe sur deux lignes, et
                // une pilule rognerait les lettres des coins.
                borderRadius: radii.code,
                backgroundColor: colors.cautionSoft,
              }}
            >
              <Icon name="warning" size={16} tone="accent" />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text variant="caption" weight={700} tone="accent">
                  {warningLabel}
                </Text>
              </View>
            </View>
            {/* Les raisons en un seul paragraphe : une raison courte tient à côté de la pastille
                (la planche) ; plusieurs passent ensemble sous elle, sur toute la largeur, au lieu
                d'une colonne étroite ou de lignes en escalier. */}
            <View style={{ flexShrink: 1, maxWidth: '100%' }}>
              <Text variant="caption" tone="muted">
                {reasons.join(' ')}
              </Text>
            </View>
          </View>
        ) : null}
        <CodeBlock>{text}</CodeBlock>
      </View>
      <CopyButton
        text={text}
        label={copyLabel}
        copiedLabel={copiedLabel}
        copy={copy}
        // Sur téléphone, où aria-describedby n'existe pas : les repères lus après le nom.
        hint={warnings.length > 0 ? [warningLabel, ...reasons].join(' ') : undefined}
        describedById={warnings.length > 0 ? warningsId : undefined}
      />
    </View>
  )
}

/** La phrase d'un repère. Une fonction par famille : le sélecteur de texte reste vérifié par tsc. */
const reasonText = (t: ReturnType<typeof useTranslation>['t'], warning: PromptWarning) => {
  switch (warning) {
    case 'command':
      return t(($) => $.project.prompts.reasons.command)
    case 'link':
      return t(($) => $.project.prompts.reasons.link)
    case 'encoded':
      return t(($) => $.project.prompts.reasons.encoded)
    case 'secret':
      return t(($) => $.project.prompts.reasons.secret)
  }
}

type CopyButtonProps = {
  text: string
  /** Le nom lu : « Copier le prompt de départ », « Copier le prompt 2 » (ui-10). */
  label: string
  /** Le nom lu pendant « Copié » : « Prompt de départ copié », « Prompt 2 copié ». */
  copiedLabel: string
  copy: Copy
  hint: string | undefined
  describedById: string | undefined
}

/**
 * « Copier », puis « Copié » pendant deux secondes. Gardé contre la double tape : une seule copie,
 * une seule bulle. Deux gardes, car une double tape peut tomber à deux moments :
 * - pendant la copie, qui attend le presse-papiers (une promesse) : `busy` refuse la 2e tape ;
 * - juste après, si la copie a été instantanée : la 2e tape, vers 150 à 250 ms, recopierait et
 *   reposerait la bulle. On ignore donc les tapes pendant TAP_GUARD_MS (600 ms, la garde commune
 *   des fenêtres et des cartes) après chaque copie commencée.
 * Ce sont des `ref` et non des états : la 2e tape arrive avant que React ait redessiné.
 */
function CopyButton({ text, label, copiedLabel, copy, hint, describedById }: CopyButtonProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const busy = useRef(false)
  const guardedUntil = useRef(0)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  // Au départ du composant (la page quittée), on arrête le minuteur de « Copié » et on note qu'il
  // ne faut plus changer l'état d'un bouton qui n'existe plus (la copie peut finir après).
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const onPress = async () => {
    const now = Date.now()
    if (busy.current || now < guardedUntil.current) return
    busy.current = true
    guardedUntil.current = now + TAP_GUARD_MS
    const done = await copy(text)
    busy.current = false
    if (!mounted.current) return
    if (resetTimer.current) clearTimeout(resetTimer.current)
    if (done) {
      setStatus('copied')
      // La bulle est polie (le toast est une région « polite ») : elle confirme sans couper la
      // parole, et ne dit rien que l'écran ne dise déjà (« Copié » sur le bouton).
      toast.show(
        t(($) => $.project.prompts.bubble),
        { icon: 'check-circle' },
      )
      resetTimer.current = setTimeout(() => setStatus('idle'), COPIED_MS)
    } else {
      // Jamais un « Copié » mensonger (ui-7). La phrase d'échec va à deux endroits :
      // - sous le bouton, où elle reste jusqu'à la prochaine copie réussie (un toast seul
      //   disparaîtrait avant qu'on ait pu la relire, et ne doit rien dire d'absent de l'écran) ;
      // - dans un toast, qui l'annonce aux lecteurs d'écran (région polie, une seule annonce) et
      //   la montre même quand le bouton est en bas de l'écran et sa phrase hors de vue
      //   (l'essai du catalogue : le 4e bloc, touché au bas d'un téléphone).
      setStatus('failed')
      toast.show(
        t(($) => $.project.prompts.copyFailed),
        { icon: 'warning-circle' },
      )
    }
  }

  const copied = status === 'copied'
  return (
    <View style={{ gap: space.xs, alignItems: 'flex-start' }}>
      <Button
        variant="secondary"
        size="compact"
        label={copied ? t(($) => $.project.prompts.copied) : t(($) => $.project.prompts.copy)}
        // Le nom lu suit le texte affiché (WCAG 2.5.3, « le nom contient le texte visible ») :
        // « Copier le prompt de départ », puis « Prompt de départ copié » pendant « Copié ».
        spokenLabel={copied ? copiedLabel : label}
        {...(copied ? { icon: 'check' as const } : null)}
        hint={hint}
        describedById={describedById}
        onPress={() => {
          void onPress()
        }}
      />
      {/* Une phrase simple, pas une région annoncée : le toast l'annonce déjà (lue deux fois
          sinon). Elle paraît sous le bouton touché : rien ne bouge sous le doigt. */}
      {status === 'failed' ? (
        <Text variant="callout" tone="danger">
          {t(($) => $.project.prompts.copyFailed)}
        </Text>
      ) : null}
    </View>
  )
}
