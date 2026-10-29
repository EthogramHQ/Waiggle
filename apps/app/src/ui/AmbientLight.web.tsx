// La lumière d'ambiance sur le web (fichier de plateforme : Metro le prend à la place
// d'AmbientLight.tsx dans le navigateur). Sur ordinateur, c'est la « lumière vivante » du prototype
// de la refonte : un dessin calculé par la carte graphique (WebGL), une matière qui coule
// lentement, colorée par la source de l'écran, avec des reflets de miel (les caustiques), une lueur
// qui suit la souris, et une impulsion à chaque action marquante. Ailleurs (téléphone, pas de
// WebGL, « Réduire les animations », page pas encore hydratée), c'est la version allégée, commune
// à toutes les plateformes (AmbientLightSoft.tsx).
//
// Vie privée : la position de la souris et le capteur d'inclinaison ne servent qu'au dessin ; rien
// n'est gardé ni envoyé ; l'image dessinée n'est jamais relue.
//
// Les gardes du canvas (relecture de sécurité S5) :
// - WebGL est demandé sans accepter une carte graphique lente (failIfMajorPerformanceCaveat), en
//   basse consommation ; refusé, ou si le shader ne compile pas, c'est la version allégée ;
// - le dessin est petit (0,45 de la taille affichée, sans tenir compte des écrans haute densité, au
//   plus 1920 × 1080) : le navigateur l'agrandit, et le flou de la matière ne s'en voit pas ;
// - la boucle d'images s'arrête quand la page est cachée, quand le contexte est perdu (la carte
//   graphique reprise par le système) et au démontage ; elle reprend au retour ;
// - la source du shader est une constante, jamais composée à partir d'une donnée : les couleurs
//   n'y entrent que par des « uniformes » (des paramètres numériques), bornés ;
// - le canvas est muet pour les lecteurs d'écran et laisse passer les clics.
import { palettes } from '@ruche/brand'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SoftLight, Veil } from './AmbientLightSoft'
import {
  type AmbientLightProps,
  type AmbientPalette,
  sourcePalette,
  useAmbientSource,
  useLightSource,
} from './theme/ambient'
import { useHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

export function AmbientLight(props: AmbientLightProps) {
  const source = useLightSource(props)
  // Avant l'hydratation, la page doit être identique à celle du serveur, qui n'a pas de canvas.
  const hydrated = useHydrated()
  const { sizeClass } = useLayout()
  // « Réduire les animations » (J5, décision du 29/10/2026) : une lumière immobile, d'une couleur
  // fixe ; la version allégée le fait (ni respiration, ni caustiques, ni souris), et garde le fondu
  // entre deux sources.
  const calm = useCalmMotion()
  const [refused, setRefused] = useState(false)
  const palette = sourcePalette(source)

  // WebGL refusé (failIfMajorPerformanceCaveat : une carte graphique lente ou absente) : la
  // version allégée, immobile, pour ne pas faire travailler la machine à chaque image.
  if (refused) return <SoftLight source={source} still />
  if (!hydrated || sizeClass !== 'wide' || calm) return <SoftLight source={source} />
  return <LiveLight palette={palette} onRefused={() => setRefused(true)} />
}

/** Ce que la boucle d'images lit à chaque image, sans redessiner le composant. */
type Live = {
  palette: Rgb[]
  night: number
  kick: number
}

function LiveLight({ palette, onRefused }: { palette: AmbientPalette; onRefused: () => void }) {
  const { scheme, colors } = useTheme()
  const { onPulse } = useAmbientSource()
  const canvas = useRef<HTMLCanvasElement | null>(null)
  // Une « ref » : une boîte gardée d'un affichage à l'autre. La boucle d'images y lit les valeurs
  // à jour (la palette, la nuit, l'impulsion) sans que React ait à redessiner quoi que ce soit.
  const live = useRef<Live>({ palette: palette.map(hexToRgb), night: 0, kick: 0 })
  const refusedRef = useRef(onRefused)
  refusedRef.current = onRefused

  const key = palette.join()
  const target = useMemo(() => key.split(',').map(hexToRgb), [key])
  useEffect(() => {
    live.current.palette = target
  }, [target])
  useEffect(() => {
    live.current.night = scheme === 'night' ? 1 : 0
  }, [scheme])
  // L'impulsion : la plus forte du moment l'emporte (le fournisseur a déjà fusionné les rafales).
  useEffect(
    () =>
      onPulse((force) => {
        live.current.kick = Math.max(live.current.kick, force)
      }),
    [onPulse],
  )

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const stop = startLight(element, live.current)
    if (!stop) {
      refusedRef.current()
      return
    }
    return stop
  }, [])

  return (
    // overflow: 'hidden' : le canvas ne déborde jamais de son cadre.
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <canvas
        ref={canvas}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {/* Le même voile que la version allégée : le texte posé plus bas reste lisible. */}
      <Veil id={`live${scheme}`} night={scheme === 'night'} background={colors.background} />
    </View>
  )
}

// ---------------------------------------------------------------------------------------------
// Le dessin

/** Une couleur en trois nombres de 0 à 1 (rouge, vert, bleu), comme les lit la carte graphique. */
type Rgb = [number, number, number]

const hexToRgb = (hex: string): Rgb => {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? 'ffffff'
  return [0, 2, 4].map((at) => clamp01(Number.parseInt(value.slice(at, at + 2), 16) / 255)) as Rgb
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

// La part de la taille affichée que l'on dessine vraiment, et la taille maximale du dessin.
const SCALE = 0.45
const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080
// Le temps du dessin repart de zéro après ce nombre de secondes (environ 2 h 45) : un uniforme
// borné, et des calculs qui gardent leur précision.
const TIME_PERIOD = 10_000
// Le plafond des caustiques (J11) : leur éclat ne dépasse jamais cette part du miel, quelle que
// soit l'impulsion. Leur rythme, fixé dans le shader (sin(f*16. + t*5.), t = temps × 0,045),
// change la luminance d'un point environ une fois toutes les 14 secondes, bien sous la limite de
// 3 inversions par seconde.
const CAUSTICS_MAX = 0.8

// Les options du contexte WebGL. failIfMajorPerformanceCaveat : refuser plutôt qu'un rendu par le
// processeur (lent, il ferait chauffer la machine) ; « low-power » : la carte graphique intégrée
// suffit. preserveDrawingBuffer: false : l'image n'est pas gardée après l'affichage.
const CONTEXT_OPTIONS: WebGLContextAttributes = {
  failIfMajorPerformanceCaveat: true,
  powerPreference: 'low-power',
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  depth: false,
  stencil: false,
}

// Le programme de la carte graphique, en deux parties. Le « vertex shader » place un grand
// triangle qui couvre tout le canvas ; le « fragment shader » calcule la couleur de chaque point.
const VERTEX_SHADER = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'

// Le shader du prototype de la refonte, porté tel quel, sauf le plafond des caustiques (uCausMax).
// fbm (« fractional Brownian motion ») additionne cinq couches de bruit de plus en plus fines : une
// matière qui ressemble à de la fumée ou à du miel qui coule. Deux fbm déforment la troisième
// (domain warping), et le temps les fait glisser. uA, uB, uC : les trois couleurs de la source ;
// uHoney : le miel des reflets ; uDark : le fond de nuit ; uPtr : la souris ; uKick : l'impulsion ;
// uNight : 0 le jour, 1 la nuit. uPortal et uLite restent à 0 (le passage par le portail et la
// version allégée du prototype viendront d'autres tranches, ou sont faits autrement ici).
const FRAGMENT_SHADER = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec3 uA,uB,uC,uHoney,uDark;uniform vec2 uPtr;uniform float uNight,uPortal,uKick,uLite,uCausMax;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/uRes;
 vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;
 float t=uTime*.045;
 float r=length(p);float ang=atan(p.y,p.x);
 vec2 pp=p;
 float full=1.-uLite;
 float pw=uPortal*full;
 if(pw>.001){float sw=pw*(1.1/(r+.2));ang+=sw+uTime*.35*pw;pp=vec2(cos(ang),sin(ang))*mix(r,pow(r,.65),pw);}
 vec2 q=vec2(fbm(pp*1.4+vec2(0.,t)),fbm(pp*1.4+vec2(5.2,1.3)-t));
 vec2 w=vec2(fbm(pp*1.4+3.*q+vec2(1.7,9.2)+.6*t),fbm(pp*1.4+3.*q+vec2(8.3,2.8)-.5*t));
 float f=fbm(pp*1.6+3.5*w);
 vec3 col=mix(uA,uB,smoothstep(.25,.85,f));
 col=mix(col,uC,smoothstep(.5,1.05,length(w))*.55);
 float c=abs(sin(f*16.+t*5.));
 float caus=pow(1.-c,12.)*smoothstep(.3,.75,f)*full;
 col+=uHoney*caus*min(.2+uKick*.6,uCausMax);
 vec2 pt=(uPtr-.5)*vec2(uRes.x/uRes.y,1.);
 float d=length(p-pt);
 float glow=exp(-d*d*3.5)*full;
 col+=uHoney*glow*.22;
 col+=vec3(1.,.92,.65)*pw*exp(-r*r*9.)*1.3;
 vec3 day=mix(vec3(1.),col,.40+uKick*.18+uPortal*.35);
 day=mix(day,vec3(1.),smoothstep(.15,-.6,p.y)*.4);
 vec3 night=uDark+col*col*.42+uHoney*caus*min(.30,uCausMax)+uHoney*glow*.16+vec3(1.,.8,.4)*pw*exp(-r*r*9.)*.6+uHoney*uPortal*.08;
 vec3 o=mix(day,night,uNight);
 o*=mix(1.,.9,smoothstep(.55,1.25,length((uv-.5)*vec2(1.3,1.))));
 gl_FragColor=vec4(o,1.);
}`

const UNIFORMS = [
  'uRes',
  'uTime',
  'uA',
  'uB',
  'uC',
  'uHoney',
  'uDark',
  'uPtr',
  'uNight',
  'uPortal',
  'uKick',
  'uLite',
  'uCausMax',
] as const
type UniformName = (typeof UNIFORMS)[number]

/** Compile et relie le programme ; null si la carte graphique le refuse (statut vérifié). */
const buildProgram = (gl: WebGLRenderingContext) => {
  const shader = (type: number, code: string) => {
    const made = gl.createShader(type)
    if (!made) return null
    gl.shaderSource(made, code)
    gl.compileShader(made)
    return gl.getShaderParameter(made, gl.COMPILE_STATUS) ? made : null
  }
  const vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  // biome-ignore lint/correctness/useHookAtTopLevel: une fonction de WebGL, pas un hook de React
  gl.useProgram(program)
  // Le grand triangle qui couvre l'écran (trois coins, dont deux hors champ).
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'p')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const uniforms = {} as Record<UniformName, WebGLUniformLocation | null>
  for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name)
  return uniforms
}

// Les couleurs fixes, tirées des jetons : le miel des reflets, le fond de nuit un peu assombri.
const HONEY = hexToRgb(palettes.day.honey)
const DARK = hexToRgb(palettes.night.background).map((channel) => channel * 0.9)

/**
 * Lance la lumière sur un canvas. Renvoie de quoi l'arrêter, ou null si WebGL est refusé : la
 * lumière prend alors sa version allégée.
 */
function startLight(canvas: HTMLCanvasElement, live: Live): (() => void) | null {
  const gl = canvas.getContext('webgl', CONTEXT_OPTIONS)
  if (!gl) return null
  let uniforms = buildProgram(gl)
  if (!uniforms) return null

  // L'état du dessin. Les couleurs affichées glissent vers celles de la source (en 0,25 s environ),
  // la nuit vers le jour, la lueur vers la souris (×0,05 par image), et l'impulsion s'éteint
  // (×0,94 par image à 60 images par seconde).
  const colors = live.palette.map((color) => [...color] as Rgb)
  let night = live.night
  let pointer: [number, number] = [0.5, 0.62]
  let pointerTarget: [number, number] = [0.5, 0.62]
  let mouse: { x: number; y: number } | null = null
  let time = 18
  let last = performance.now()
  let frame = 0
  let lost = false

  const resize = () => {
    const density = Math.min(1, globalThis.devicePixelRatio || 1)
    const width = Math.min(MAX_WIDTH, Math.max(2, Math.round(canvas.clientWidth * SCALE * density)))
    const height = Math.min(
      MAX_HEIGHT,
      Math.max(2, Math.round(canvas.clientHeight * SCALE * density)),
    )
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    gl.viewport(0, 0, width, height)
  }

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw)
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    if (!uniforms) return
    resize()
    const towardColor = 1 - Math.exp(-dt / 0.25)
    const towardNight = 1 - Math.exp(-dt / 0.15)
    for (let i = 0; i < 3; i++) {
      const shown = colors[i]
      const wanted = live.palette[i]
      if (!shown || !wanted) continue
      for (let j = 0; j < 3; j++)
        shown[j] = clamp01(lerp(shown[j] ?? 0, wanted[j] ?? 0, towardColor))
    }
    night = clamp01(lerp(night, live.night, towardNight))
    live.kick = clamp01(live.kick * 0.94 ** (dt * 60))
    if (mouse) {
      const box = canvas.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) {
        pointerTarget = [
          clamp01((mouse.x - box.left) / box.width),
          clamp01(1 - (mouse.y - box.top) / box.height),
        ]
      }
      mouse = null
    }
    pointer = [lerp(pointer[0], pointerTarget[0], 0.05), lerp(pointer[1], pointerTarget[1], 0.05)]
    time = (time + dt) % TIME_PERIOD

    gl.uniform2f(uniforms.uRes, canvas.width, canvas.height)
    gl.uniform1f(uniforms.uTime, time)
    gl.uniform3fv(uniforms.uA, colors[0] ?? HONEY)
    gl.uniform3fv(uniforms.uB, colors[1] ?? HONEY)
    gl.uniform3fv(uniforms.uC, colors[2] ?? HONEY)
    gl.uniform3fv(uniforms.uHoney, HONEY)
    gl.uniform3fv(uniforms.uDark, DARK)
    gl.uniform2f(uniforms.uPtr, pointer[0], pointer[1])
    gl.uniform1f(uniforms.uNight, night)
    gl.uniform1f(uniforms.uPortal, 0)
    gl.uniform1f(uniforms.uKick, live.kick)
    gl.uniform1f(uniforms.uLite, 0)
    gl.uniform1f(uniforms.uCausMax, CAUSTICS_MAX)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const play = () => {
    if (frame || lost || document.visibilityState === 'hidden') return
    last = performance.now()
    frame = requestAnimationFrame(draw)
  }
  const pause = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }

  // Le contexte perdu (le système a repris la carte graphique) : on arrête de dessiner, et
  // preventDefault dit au navigateur qu'on veut le récupérer. Rendu : on recompile, on reprend.
  const onLost = (event: Event) => {
    event.preventDefault()
    lost = true
    pause()
  }
  const onRestored = () => {
    uniforms = buildProgram(gl)
    if (!uniforms) return
    lost = false
    play()
  }
  // La page cachée (un autre onglet, la fenêtre réduite) : plus rien à dessiner.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pause()
    else play()
  }
  // La souris : seulement sa position, convertie à l'image suivante (une seule mesure du cadre
  // par image). Un doigt sur un écran tactile ne déplace pas la lueur.
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    mouse = { x: event.clientX, y: event.clientY }
  }

  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  document.addEventListener('visibilitychange', onVisibility)
  globalThis.addEventListener('pointermove', onPointer, { passive: true })
  play()

  return () => {
    pause()
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
    document.removeEventListener('visibilitychange', onVisibility)
    globalThis.removeEventListener('pointermove', onPointer)
    // Rendre la carte graphique tout de suite plutôt qu'au ramasse-miettes : le navigateur limite
    // le nombre de contextes WebGL ouverts à la fois.
    gl.getExtension('WEBGL_lose_context')?.loseContext?.()
  }
}

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount
