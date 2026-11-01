/**
 * Materiały Three.js budowane z biblioteki materiałów projektu.
 *
 * PBR (Physically Based Rendering) = materiał opisany fizycznie: kolor bazowy, chropowatość (roughness:
 * 0 = lustro/połysk, 1 = mat) i metaliczność. Dzięki temu „mat” i „połysk” wyglądają różnie przy tym samym kolorze.
 *
 * Drewno: zamiast zdjęć dekorów (licencje — SPEC 10.5) generujemy proceduralne usłojenie w dwóch
 * kierunkach. Element „pionowy” (stojak, drzwi) dostaje usłojenie pionowe, „poziomy” (poprzeczka, szuflada) — poziome.
 */
import * as THREE from 'three'
import type { Grain } from '../../geometry/frontParts'
import type { MaterialT } from '../../model/schema'

/** Długość jednego „kafla” tekstury drewna w mm. */
export const WOOD_TILE_MM = 600

let woodCanvas: HTMLCanvasElement | null = null

/** Szaro-biała mapa usłojenia (mnożona przez kolor materiału). Generowana raz. */
function woodPattern(): HTMLCanvasElement {
  if (woodCanvas) return woodCanvas
  const S = 512
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(S, S)
  // Deterministyczny „szum” (bez Math.random — ten sam wygląd za każdym razem).
  const rnd = (i: number) => {
    const x = Math.sin(i * 127.1) * 43758.5453
    return x - Math.floor(x)
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Słoje biegną w pionie (wzdłuż y); falują lekko na boki.
      const wx = x + Math.sin(y * 0.018 + rnd(Math.floor(x / 40)) * 6) * 5 + Math.sin(y * 0.004) * 9
      const rings = Math.sin(wx * 0.22) * 0.5 + Math.sin(wx * 0.071 + 1.3) * 0.35 + Math.sin(wx * 0.9) * 0.08
      const fleck = rnd(Math.floor(wx) * 31 + Math.floor(y / 3)) * 0.05
      const v = 0.86 + rings * 0.09 - fleck
      const i = (y * S + x) * 4
      const g = Math.max(0, Math.min(255, v * 255))
      img.data[i] = g
      img.data[i + 1] = g
      img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  woodCanvas = c
  return c
}

function woodTexture(grain: Grain) {
  const t = new THREE.CanvasTexture(woodPattern())
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (grain === 'horizontal') {
    t.center.set(0.5, 0.5)
    t.rotation = Math.PI / 2
  }
  return t
}

export interface MatSet {
  vertical: THREE.MeshStandardMaterial
  horizontal: THREE.MeshStandardMaterial
  isWood: boolean
}

export function buildMatSet(m: MaterialT): MatSet {
  const base = { color: m.color, roughness: m.roughness, metalness: m.metalness }
  if (m.texture === 'wood') {
    return {
      vertical: new THREE.MeshStandardMaterial({ ...base, map: woodTexture('vertical') }),
      horizontal: new THREE.MeshStandardMaterial({ ...base, map: woodTexture('horizontal') }),
      isWood: true,
    }
  }
  const one = new THREE.MeshStandardMaterial(base)
  return { vertical: one, horizontal: one, isWood: false }
}

const geoCache = new Map<string, THREE.BoxGeometry>()

/**
 * Geometria prostopadłościanu z UV w skali milimetrów — tekstura drewna ma wtedy tę samą „gęstość słojów”
 * na wąskim stojaku i na szerokiej płycinie (zamiast rozciągać się na każdą ścianę bryły).
 */
export function woodBox(sx: number, sy: number, sz: number): THREE.BoxGeometry {
  const key = `${sx}|${sy}|${sz}`
  const hit = geoCache.get(key)
  if (hit) return hit
  const g = new THREE.BoxGeometry(sx, sy, sz)
  const uv = g.attributes.uv as THREE.BufferAttribute
  // Kolejność ścian BoxGeometry: +x, −x, +y, −y, +z, −z (po 4 wierzchołki).
  const faceDims: [number, number][] = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ]
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, (uv.getX(i) * faceDims[f][0]) / WOOD_TILE_MM, (uv.getY(i) * faceDims[f][1]) / WOOD_TILE_MM)
    }
  }
  uv.needsUpdate = true
  geoCache.set(key, g)
  return g
}
