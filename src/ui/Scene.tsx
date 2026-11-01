/**
 * Scena 3D — tylko WIZUALIZACJA JSON projektu (jedno źródło prawdy = JSON).
 *
 * React Three Fiber (R3F) pozwala opisywać scenę Three.js jak komponenty React:
 * <mesh> = bryła, <boxGeometry> = kształt, <meshStandardMaterial> = materiał PBR (reaguje na światło).
 * Wszystkie wymiary podajemy w mm, a cała scena jest przeskalowana ×0.001 (= metry dla kamery).
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { carcassPanels } from '../geometry/carcass'
import { layerLength, placeRun, wallFrame, type PlacedCabinet } from '../geometry/layout'
import type { MaterialT, ProjectT, RunT } from '../model/schema'
import { useStore } from '../store/projectStore'

const FRONT_T = 18
const unitBox = new THREE.BoxGeometry(1, 1, 1)

/** Biblioteka materiałów Three.js budowana z listy materiałów projektu. */
function useMaterials(materials: MaterialT[]) {
  return useMemo(() => {
    const map = new Map<string, THREE.MeshStandardMaterial>()
    for (const m of materials) {
      map.set(m.id, new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness }))
    }
    return map
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
const darkGlass = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.15, metalness: 0.2 })

/** Prostopadłościan o środku (cx,cy,cz) i wymiarach (sx,sy,sz) w mm — jedna współdzielona geometria, skalowana. */
function Box(props: {
  c: [number, number, number]
  s: [number, number, number]
  mat: THREE.Material
  noHit?: boolean
}) {
  return (
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
function Wall({ f, room, mat }: { f: ReturnType<typeof wallFrame>; room: ProjectT['room']; mat: THREE.Material }) {
  const ref = useRef<THREE.Group>(null)
  const T = 100
  useFrame(({ camera }) => {
    if (!ref.current) return
    // Wektor normalny do wnętrza pokoju = oś z ściany po obrocie: (sin(rotY), cos(rotY)).
    const nx = Math.sin(f.rotY)
    const nz = Math.cos(f.rotY)
    const vx = camera.position.x * 1000 - f.ox
    const vz = camera.position.z * 1000 - f.oz
    ref.current.visible = vx * nx + vz * nz > 0
  })
  return (
    <group ref={ref} position={[f.ox, 0, f.oz]} rotation={[0, f.rotY, 0]}>
      <Box c={[f.length / 2, room.height / 2, -T / 2]} s={[f.length, room.height, T]} mat={mat} noHit />
    </group>
  )
}

function CabinetMesh({ pc, mats }: { pc: PlacedCabinet; mats: Map<string, THREE.MeshStandardMaterial> }) {
  const { cabinet: cab } = pc
  const selected = useStore((s) => s.selectedCabinetId === cab.id)
  const select = useStore((s) => s.select)
  const carcassMat = selected ? selectedMat : (mats.get(cab.carcassMaterialId ?? '') ?? fallback)
  const panels = useMemo(() => carcassPanels(cab), [cab])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation() // tylko najbliższa szafka, nie te za nią
    select(cab.id)
  }

  return (
    <group position={[pc.x, pc.y, pc.z]} rotation={[0, pc.rotY, 0]} onClick={onClick}>
      {panels.map((p) => (
        <Box key={p.name} c={[p.cx, p.cy, p.cz]} s={[p.sx, p.sy, p.sz]} mat={carcassMat} />
      ))}
      {cab.fronts.map((f) => {
        const m = selected ? selectedMat : (mats.get(f.materialId) ?? fallback)
        const cz = cab.depth + FRONT_T / 2
        const handle = cab.handle && cab.handle.type !== 'none' && cab.type !== 'filler'
        // Uchwyt-reling 128 mm: przy górnej krawędzi frontu dolnego, dolnej górnego; poziomo na szufladach.
        const isUpper = cab.type === 'wall' || cab.type === 'appliance'
        const hy = f.kind === 'drawer' ? f.y + f.height / 2 : isUpper ? f.y + 60 : f.y + f.height - 60
        const vertical = f.kind === 'door-left' || f.kind === 'door-right'
        const hx = f.kind === 'door-left' ? f.x + f.width - 40 : f.kind === 'door-right' ? f.x + 40 : f.x + f.width / 2
        return (
          <group key={f.id}>
            <Box c={[f.x + f.width / 2, f.y + f.height / 2, cz]} s={[f.width, f.height, FRONT_T]} mat={m} />
            {handle && (
              <Box
                c={[hx, Math.min(hy, cab.height - 30), cab.depth + FRONT_T + 12]}
                s={vertical ? [12, 160, 12] : [160, 12, 12]}
                mat={metal}
              />
            )}
          </group>
        )
      })}
    </group>
  )
}

/** Blat + cokół ciągu. Pozycje liczone w lokalnym układzie ściany, potem obrót jak szafki. */
function RunExtras({
  run,
  room,
  mats,
}: {
  run: RunT
  room: ProjectT['room']
  mats: Map<string, THREE.MeshStandardMaterial>
}) {
  const f = wallFrame(run.wallId, room)
  const base = run.layers.base ?? []
  const tall = run.layers.tall ?? []
  const items: ReactNode[] = []

  const plinthMat = mats.get(base[0]?.carcassMaterialId ?? tall[0]?.carcassMaterialId ?? '') ?? fallback
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
        mat={plinthMat}
      />,
    )
  }

  if (run.worktop && base.length) {
    const wt = run.worktop
    const len = layerLength(run, 'base')
    const top = Math.max(...base.map((c) => c.elevation + c.height))
    const depth = Math.max(...base.map((c) => c.depth)) + FRONT_T + wt.overhangFront
    items.push(
      <Box
        key="worktop"
        c={[run.startOffset + len / 2, top + wt.thickness / 2, depth / 2]}
        s={[len, wt.thickness, depth]}
        mat={mats.get(wt.materialId) ?? fallback}
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
    <group position={[f.ox, 0, f.oz]} rotation={[0, f.rotY, 0]}>
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
      <Box c={[room.width / 2, -10, room.depth / 2]} s={[room.width, 20, room.depth]} mat={floorMat} noHit />
      {showWalls && room.walls.map((w) => <Wall key={w.id} f={wallFrame(w.id, room)} room={room} mat={wallMat} />)}
      {room.obstacles.map((o) => {
        const f = wallFrame(o.wallId, room)
        const isOpening = o.kind === 'window' || o.kind === 'door'
        if (isOpening && !showWalls) return null
        return (
          <group key={o.id} position={[f.ox, 0, f.oz]} rotation={[0, f.rotY, 0]}>
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

/** Ustawia kamerę wg presetu (izometria, front ściany, wzrok człowieka 160 cm). */
function CameraRig({ room }: { room: ProjectT['room'] }) {
  const preset = useStore((s) => s.cameraPreset)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const W = room.width / 1000
    const D = room.depth / 1000
    const H = room.height / 1000
    const target = new THREE.Vector3(W / 2, 1.0, D / 2)
    let pos: THREE.Vector3
    switch (preset.name) {
      case 'front-A':
        target.set(W / 2, 1.2, 0.3)
        pos = new THREE.Vector3(W / 2, 1.3, Math.max(D, 3) + 0.5)
        break
      case 'front-B':
        target.set(W - 0.3, 1.2, D / 2)
        pos = new THREE.Vector3(Math.min(-0.5, W - Math.max(W, 3) - 0.5), 1.3, D / 2)
        break
      case 'eye':
        target.set(W * 0.75, 1.2, D * 0.25)
        pos = new THREE.Vector3(W * 0.2, 1.6, D * 0.85)
        break
      default:
        pos = new THREE.Vector3(W * 0.15 - 1.5, H + 1.6, D + 2.5)
    }
    // Ekran pionowy (telefon): odsuń kamerę, żeby cała zabudowa zmieściła się w kadrze.
    const aspect = size.width / Math.max(size.height, 1)
    if (preset.name !== 'eye' && aspect < 1.2) {
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

export function Scene({ project }: { project: ProjectT }) {
  const mats = useMaterials(project.materials)
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
    </Canvas>
  )
}
