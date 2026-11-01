/**
 * Przechwytywanie widoków sceny 3D do PDF: izometria (perspektywa) i rzuty ścian (kamera ortogonalna).
 *
 * Kamera ortogonalna = rzut „jak na rysunku technicznym”: bez perspektywy, 1 mm zawsze tyle samo pikseli.
 * Dzięki temu na rzucie ściany możemy dorysować łańcuchy wymiarowe dokładnie w miejscu szafek.
 *
 * Renderujemy osobnym, tymczasowym rendererem WebGL (ta sama scena, inny „aparat”), żeby nie
 * zmieniać rozmiaru widoku na ekranie. Po zrobieniu zdjęć renderer jest niszczony (iPhone ma limit kontekstów WebGL).
 */
import * as THREE from 'three'
import { wallFrame } from '../geometry/layout'
import type { ProjectT, WallIdT } from '../model/schema'

let sceneRef: THREE.Scene | null = null

export function registerCapture(scene: THREE.Scene) {
  sceneRef = scene
  return () => {
    if (sceneRef === scene) sceneRef = null
  }
}

export type CaptureView = { kind: 'iso' } | { kind: 'wall'; wallId: WallIdT }

export interface Shot {
  dataUrl: string
  width: number
  height: number
  /** Tylko dla rzutów ścian: przeliczenie mm → piksele obrazu. */
  map?: { pxPerMm: number; marginMm: number; wallLength: number; roomHeight: number }
}

/** Margines wokół ściany na rzucie (mm). */
const MARGIN = 150

function setVisibility(scene: THREE.Scene, view: CaptureView, camPos: THREE.Vector3) {
  const restore: [THREE.Object3D, boolean][] = []
  scene.traverse((o) => {
    const tag = o.userData?.tag as string | undefined
    if (!tag) return
    let visible = o.visible
    if (view.kind === 'wall') {
      if (tag === 'wall' || tag === 'floor') visible = false
      else if (tag === 'cab' || tag === 'extra') visible = o.userData.wallId === view.wallId
      else if (tag === 'obstacle') visible = o.userData.wallId === view.wallId
    } else if (tag === 'wall') {
      o.userData.captureOverride = true
      // Ten sam warunek co na ekranie: ściana widoczna, gdy kamera jest po wewnętrznej stronie.
      const nx = Math.sin(o.rotation.y)
      const nz = Math.cos(o.rotation.y)
      visible = (camPos.x * 1000 - o.position.x) * nx + (camPos.z * 1000 - o.position.z) * nz > 0
    }
    restore.push([o, o.visible])
    o.visible = visible
  })
  return () => {
    for (const [o, v] of restore) {
      o.visible = v
      delete o.userData.captureOverride
    }
  }
}

export async function captureViews(project: ProjectT, views: CaptureView[], widthPx = 1800): Promise<Shot[]> {
  const scene = sceneRef
  if (!scene) throw new Error('Widok 3D nie jest gotowy — otwórz projekt i spróbuj ponownie.')
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.shadowMap.enabled = true
  renderer.setPixelRatio(1)
  const oldBg = scene.background
  scene.background = new THREE.Color('#ffffff')
  const shots: Shot[] = []
  try {
    for (const view of views) {
      let camera: THREE.Camera
      let width = widthPx
      let height: number
      let map: Shot['map']
      if (view.kind === 'iso') {
        height = Math.round(widthPx * 0.66)
        const cam = new THREE.PerspectiveCamera(45, width / height, 0.05, 100)
        const W = project.room.width / 1000
        const D = project.room.depth / 1000
        const H = project.room.height / 1000
        const target = new THREE.Vector3(W / 2, 0.9, D / 2)
        cam.position.set(W * 0.15 - 1.2, H + 1.2, D + 2.2)
        cam.lookAt(target)
        camera = cam
      } else {
        const f = wallFrame(view.wallId, project.room)
        const L = f.length
        const Hroom = project.room.height
        const spanW = L + 2 * MARGIN
        const spanH = Hroom + 2 * MARGIN
        width = widthPx
        height = Math.round((widthPx * spanH) / spanW)
        const cam = new THREE.OrthographicCamera(-spanW / 2000, spanW / 2000, spanH / 2000, -spanH / 2000, 0.01, 50)
        const nx = Math.sin(f.rotY)
        const nz = Math.cos(f.rotY)
        const cx = (f.ox + f.dx * (L / 2)) / 1000
        const cz = (f.oz + f.dz * (L / 2)) / 1000
        cam.position.set(cx + nx * 10, Hroom / 2000, cz + nz * 10)
        cam.up.set(0, 1, 0)
        cam.lookAt(cx, Hroom / 2000, cz)
        camera = cam
        map = { pxPerMm: width / spanW, marginMm: MARGIN, wallLength: L, roomHeight: Hroom }
      }
      renderer.setSize(width, height, false)
      const restore = setVisibility(scene, view, camera.position)
      scene.updateMatrixWorld(true)
      renderer.render(scene, camera)
      restore()
      shots.push({ dataUrl: renderer.domElement.toDataURL('image/jpeg', 0.9), width, height, map })
    }
  } finally {
    scene.background = oldBg
    renderer.dispose()
    renderer.forceContextLoss()
  }
  return shots
}
