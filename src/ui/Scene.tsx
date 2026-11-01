/**
 * Scena 3D — tylko WIZUALIZACJA JSON projektu (jedno źródło prawdy = JSON).
 *
 * React Three Fiber (R3F) pozwala opisywać scenę Three.js jak komponenty React:
 * <mesh> = bryła, <boxGeometry> = kształt, <meshStandardMaterial> = materiał PBR (reaguje na światło).
 * Wszystkie wymiary podajemy w mm, a cała scena jest przeskalowana ×0.001 (= metry dla kamery).
 *
 * Grupy mają znaczniki userData (tag, wallId) — używa ich przechwytywanie widoków do PDF (capture.ts),
 * żeby np. na rzucie ściany A pokazać tylko szafki ściany A.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { carcassPanels } from '../geometry/carcass'
import { FRONT_THICKNESS, frontParts, type Grain } from '../geometry/frontParts'
import { layerLength, placeRun, wallFrame, type PlacedCabinet } from '../geometry/layout'
import { findMaterial } from '../materials/assign'
import type { ProjectT, RunT } from '../model/schema'
import { useStore } from '../store/projectStore'
import { registerCapture } from './capture'
import { buildMatSet, woodBox, type MatSet } from './three/materials3d'

const unitBox = new THREE.BoxGeometry(1, 1, 1)

type Mats = (id: string | undefined) => MatSet

/** Materiały Three.js dla wszystkich materiałów użytych w projekcie (+ zapasowy z biblioteki). */
function useMaterials(project: ProjectT): Mats {
  const materials = project.materials
  return useMemo(() => {
    // Wszystkie materiały projektu budujemy od razu (raz na zmianę listy materiałów).
    const sets = new Map(materials.map((m) => [m.id, buildMatSet(m)] as const))
    const none: MatSet = { vertical: fallback, horizontal: fallback, isWood: false }
    return (id: string | undefined) => {
      const hit = id ? sets.get(id) : undefined
      if (hit) return hit
      // Materiał spoza listy projektu (np. ręczny JSON) — z biblioteki, jeśli istnieje.
      const def = findMaterial({ materials: [] }, id)
      return def ? buildMatSet(def) : none
    }
  }, [materials])
}

const fallback = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.7 })
const selectedMat = new THREE.MeshStandardMaterial({
  color: '#4f9dff',
  roughness: 0.5,
  emissive: '#1d4ed8',
  emissiveIntensity: 0.25,
})
const metal = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.3, metalness: 0.9 })
const blackMetal = new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.4, metalness: 0.6 })
const darkGlass = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.15, metalness: 0.2 })
const glassMat = new THREE.MeshStandardMaterial({
  color: '#cfe3e8',
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.35,
})

/** Prostopadłościan o środku c i wymiarach s (mm). Drewno: geometria z UV w mm; reszta: wspólna bryła skalowana. */
function Box(props: {
  c: [number, number, number]
  s: [number, number, number]
  mat: THREE.Material
  noHit?: boolean
  wood?: boolean
}) {
  const [sx, sy, sz] = props.s
  return props.wood ? (
    <mesh geometry={woodBox(sx, sy, sz)} material={props.mat} position={props.c} castShadow receiveShadow />
  ) : (
    <mesh
      geometry={unitBox}
      material={props.mat}
      position={props.c}
      scale={props.s}
      castShadow
      receiveShadow
      // Ściany/podłoga nie „łapią” tapnięć — inaczej zasłaniałyby szafki przy zaznaczaniu.
      raycast={props.noHit ? () => null : undefined}
    />
  )
}

/**
 * Ściana widoczna tylko, gdy kamera jest PO WEWNĘTRZNEJ stronie (widok „domku dla lalek”).
 * useFrame = kod wykonywany co klatkę animacji (ok. 60×/s).
 */
function Wall({
  f,
  room,
  mat,
  wallId,
}: {
  f: ReturnType<typeof wallFrame>
  room: ProjectT['room']
  mat: THREE.Material
  wallId: string
}) {
  const ref = useRef<THREE.Group>(null)
  const T = 100
  useFrame(({ camera }) => {
    if (!ref.current || ref.current.userData.captureOverride) return
    const nx = Math.sin(f.rotY)
    const nz = Math.cos(f.rotY)
    const vx = camera.position.x * 1000 - f.ox
    const vz = camera.position.z * 1000 - f.oz
    ref.current.visible = vx * nx + vz * nz > 0
  })
  return (
    <group ref={ref} position={[f.ox, 0, f.oz]} rotation={[0, f.rotY, 0]} userData={{ tag: 'wall', wallId }}>
      <Box c={[f.length / 2, room.height / 2, -T / 2]} s={[f.length, room.height, T]} mat={mat} noHit />
    </group>
  )
}

function pick(set: MatSet, grain: Grain) {
  return grain === 'horizontal' ? set.horizontal : set.vertical
}

function CabinetMesh({ pc, mats }: { pc: PlacedCabinet; mats: Mats }) {
  const { cabinet: cab } = pc
  const selected = useStore((s) => s.selectedCabinetId === cab.id)
  const select = useStore((s) => s.select)
  const carcassSet = mats(cab.carcassMaterialId)
  const panels = useMemo(() => carcassPanels(cab), [cab])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation() // tylko najbliższa szafka, nie te za nią
    select(cab.id)
  }
  const handleMat = cab.handle?.type === 'gola' ? blackMetal : metal

  return (
    <group
      position={[pc.x, pc.y, pc.z]}
      rotation={[0, pc.rotY, 0]}
      onClick={onClick}
      userData={{ tag: 'cab', wallId: pc.wallId, id: cab.id }}
    >
      {panels.map((p) => (
        <Box
          key={p.name}
          c={[p.cx, p.cy, p.cz]}
          s={[p.sx, p.sy, p.sz]}
          mat={selected ? selectedMat : carcassSet.vertical}
          wood={!selected && carcassSet.isWood}
        />
      ))}
      {cab.fronts.map((f) => {
        const set = mats(f.materialId)
        const parts = frontParts(f)
        const showHandle =
          cab.handle &&
          !['none', 'push', 'gola'].includes(cab.handle.type) &&
          cab.type !== 'filler' &&
          f.kind !== 'blind'
        // Uchwyt-reling 160 mm: przy górnej krawędzi frontu dolnego, przy dolnej górnego; poziomo na szufladach.
        const isUpper = cab.type === 'wall' || cab.type === 'appliance'
        const hy = f.kind === 'drawer' ? f.y + f.height / 2 : isUpper ? f.y + 60 : f.y + f.height - 60
        const vertical = f.kind === 'door-left' || f.kind === 'door-right' || f.kind === 'glass'
        const hx =
          f.kind === 'door-left' || f.kind === 'glass'
            ? f.x + f.width - 40
            : f.kind === 'door-right'
              ? f.x + 40
              : f.x + f.width / 2
        const knob = cab.handle?.type === 'knob'
        return (
          <group key={f.id} position={[0, 0, cab.depth]}>
            {parts.map((p) => {
              const isGlassPanel = f.kind === 'glass' && (p.role === 'slab' || p.role === 'panel')
              const mat = selected ? selectedMat : isGlassPanel ? glassMat : pick(set, p.grain)
              return (
                <Box
                  key={p.name}
                  c={[p.cx, p.cy, p.cz]}
                  s={[p.sx, p.sy, p.sz]}
                  mat={mat}
                  wood={!selected && !isGlassPanel && set.isWood}
                />
              )
            })}
            {showHandle && (
              <Box
                c={[hx, Math.min(hy, cab.height - 30), FRONT_THICKNESS + 12]}
                s={knob ? [24, 24, 24] : vertical ? [12, 160, 12] : [160, 12, 12]}
                mat={handleMat}
              />
            )}
          </group>
        )
      })}
      {/* Frezowany uchwyt „gola”: ciemny profil nad frontami dolnymi. */}
      {cab.handle?.type === 'gola' && cab.type === 'base' && (
        <Box c={[cab.width / 2, cab.height - 15, cab.depth - 10]} s={[cab.width, 30, 20]} mat={blackMetal} />
      )}
    </group>
  )
}

/** Blat + cokół ciągu. Pozycje liczone w lokalnym układzie ściany, potem obrót jak szafki. */
function RunExtras({ run, room, mats }: { run: RunT; room: ProjectT['room']; mats: Mats }) {
  const f = wallFrame(run.wallId, room)
  const base = run.layers.base ?? []
  const tall = run.layers.tall ?? []
  const items: ReactNode[] = []

  const plinthSet = mats(base[0]?.carcassMaterialId ?? tall[0]?.carcassMaterialId)
  for (const [layer, cabs] of [
    ['base', base],
    ['tall', tall],
  ] as const) {
    if (!cabs.length || run.plinthHeight === 0) continue
    const len = layerLength(run, layer)
    const d = Math.max(...cabs.map((c) => c.depth))
    items.push(
      <Box
        key={`plinth-${layer}`}
        c={[run.startOffset + len / 2, run.plinthHeight / 2, d - run.plinthSetback - 9]}
        s={[len, run.plinthHeight, 18]}
        mat={plinthSet.horizontal}
        wood={plinthSet.isWood}
      />,
    )
  }

  if (run.worktop && base.length) {
    const wt = run.worktop
    const len = layerLength(run, 'base')
    const top = Math.max(...base.map((c) => c.elevation + c.height))
    const depth = Math.max(...base.map((c) => c.depth)) + FRONT_THICKNESS + wt.overhangFront
    const set = mats(wt.materialId)
    items.push(
      <Box
        key="worktop"
        c={[run.startOffset + len / 2, top + wt.thickness / 2, depth / 2]}
        s={[len, wt.thickness, depth]}
        mat={set.horizontal}
        wood={set.isWood}
      />,
    )
    // Uproszczone AGD w wycięciach blatu (płyta = czarne szkło, zlew = stal).
    for (const c of wt.cutouts) {
      const isHob = c.kind === 'hob'
      items.push(
        <Box
          key={`cut-${c.kind}-${c.x}`}
          c={[run.startOffset + c.x + c.width / 2, top + wt.thickness + (isHob ? 3 : 1), depth / 2]}
          s={[c.width, isHob ? 6 : 2, c.depth]}
          mat={isHob ? darkGlass : metal}
        />,
      )
    }
  }
  return (
    <group position={[f.ox, 0, f.oz]} rotation={[0, f.rotY, 0]} userData={{ tag: 'extra', wallId: run.wallId }}>
      {items}
    </group>
  )
}

function Room({ project }: { project: ProjectT }) {
  const { room } = project
  const showWalls = useStore((s) => s.showWalls)
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#d9d4cb',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  )
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8b8a0', roughness: 0.9 }), [])
  const murekMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9b2a7', roughness: 0.95 }), [])
  const windowMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#a8d4ff', transparent: true, opacity: 0.5, depthWrite: false }),
    [],
  )
  const T = 100 // grubość ściany do wizualizacji

  return (
    <group>
      <group userData={{ tag: 'floor' }}>
        <Box c={[room.width / 2, -10, room.depth / 2]} s={[room.width, 20, room.depth]} mat={floorMat} noHit />
      </group>
      {showWalls &&
        room.walls.map((w) => <Wall key={w.id} wallId={w.id} f={wallFrame(w.id, room)} room={room} mat={wallMat} />)}
      {room.obstacles.map((o) => {
        const f = wallFrame(o.wallId, room)
        const isOpening = o.kind === 'window' || o.kind === 'door'
        if (isOpening && !showWalls) return null
        return (
          <group
            key={o.id}
            position={[f.ox, 0, f.oz]}
            rotation={[0, f.rotY, 0]}
            userData={{ tag: 'obstacle', wallId: o.wallId, opening: isOpening }}
          >
            <Box
              c={[o.x + o.w / 2, o.y + o.h / 2, isOpening ? -T / 2 : o.d / 2]}
              s={[o.w, o.h, isOpening ? T + 4 : Math.max(o.d, 1)]}
              mat={isOpening ? windowMat : murekMat}
              noHit
            />
          </group>
        )
      })}
    </group>
  )
}

/** Pozycja kamery „izometrii” — wspólna dla widoku na ekranie i PDF. */
function isoCamera(room: ProjectT['room'], aspect: number) {
  const W = room.width / 1000
  const D = room.depth / 1000
  const H = room.height / 1000
  const target = new THREE.Vector3(W / 2, 1.0, D / 2)
  const pos = new THREE.Vector3(W * 0.15 - 1.5, H + 1.6, D + 2.5)
  if (aspect < 1.2)
    pos
      .sub(target)
      .multiplyScalar(Math.pow(1.2 / aspect, 0.85))
      .add(target)
  return { pos, target }
}

/** Ustawia kamerę wg presetu (izometria, front ściany, wzrok człowieka 160 cm). */
function CameraRig({ room }: { room: ProjectT['room'] }) {
  const preset = useStore((s) => s.cameraPreset)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const W = room.width / 1000
    const D = room.depth / 1000
    const aspect = size.width / Math.max(size.height, 1)
    let { pos, target } = isoCamera(room, aspect)
    switch (preset.name) {
      case 'front-A':
        target = new THREE.Vector3(W / 2, 1.2, 0.3)
        pos = new THREE.Vector3(W / 2, 1.3, Math.max(D, 3) + 0.5)
        break
      case 'front-B':
        target = new THREE.Vector3(W - 0.3, 1.2, D / 2)
        pos = new THREE.Vector3(Math.min(-0.5, W - Math.max(W, 3) - 0.5), 1.3, D / 2)
        break
      case 'eye':
        target = new THREE.Vector3(W * 0.75, 1.2, D * 0.25)
        pos = new THREE.Vector3(W * 0.2, 1.6, D * 0.85)
        break
    }
    if ((preset.name === 'front-A' || preset.name === 'front-B') && aspect < 1.2) {
      pos
        .sub(target)
        .multiplyScalar(Math.pow(1.2 / aspect, 0.85))
        .add(target)
    }
    camera.position.copy(pos)
    controls.current?.target.copy(target)
    controls.current?.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kadrujemy przy zmianie presetu/pokoju, nie przy każdym obrocie ekranu
  }, [preset, room, camera])

  return <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI * 0.95} />
}

/** Udostępnia scenę funkcji przechwytywania widoków (PDF). */
function CaptureBridge() {
  const scene = useThree((s) => s.scene)
  useEffect(() => registerCapture(scene), [scene])
  return null
}

export function Scene({ project }: { project: ProjectT }) {
  const mats = useMaterials(project)
  const select = useStore((s) => s.select)
  const placed = useMemo(() => project.runs.flatMap((r) => placeRun(r, project.room)), [project])

  return (
    <Canvas
      shadows
      dpr={[1, 2]} // na telefonach z gęstym ekranem max 2× — kompromis ostrość/wydajność
      camera={{ fov: 50, near: 0.05, far: 100, position: [3, 3, 5] }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#eef0f3']} />
      <hemisphereLight args={['#ffffff', '#b8a990', 1.2]} />
      <directionalLight
        position={[2, 5, 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <group scale={0.001}>
        <Room project={project} />
        {placed.map((pc) => (
          <CabinetMesh key={pc.cabinet.id} pc={pc} mats={mats} />
        ))}
        {project.runs.map((r) => (
          <RunExtras key={r.id} run={r} room={project.room} mats={mats} />
        ))}
      </group>
      <CameraRig room={project.room} />
      <CaptureBridge />
    </Canvas>
  )
}
