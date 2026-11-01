/**
 * Przykładowy projekt: kuchnia w L (ściana A + ściana B).
 *
 * UWAGA: to dane PRZYKŁADOWE do etapu 1 (generator 3D z ręcznie wpisanego JSON).
 * Wymiary inspirowane opisem szkicu w SPEC (386,5 cm, 170,5 cm, moduły 34/60/60/45/80, murek ~21 cm),
 * ale nie są odczytem rzeczywistego szkicu — ten zrobi moduł AI w etapie 4.
 */
import { makeFronts } from '../geometry/fronts'
import { SCHEMA_VERSION, type CabinetT, type ProjectT } from './schema'

const FRONT = 'front-white-lacquer'
const CARCASS = 'carcass-white'
const PLINTH_H = 100
const BASE_H = 720
const BASE_D = 560
const WALL_D = 320
const WALL_ELEV = 1450

type Opts = Partial<CabinetT> & Pick<CabinetT, 'id' | 'type' | 'width' | 'height' | 'depth' | 'elevation'>

function cab(o: Opts, fronts: Parameters<typeof makeFronts>[3] | null): CabinetT {
  return {
    carcass: { boardThickness: 18, backThickness: 3 },
    carcassMaterialId: CARCASS,
    handle: { type: 'bar', position: 'top' },
    ...o,
    fronts: fronts ? makeFronts(o.id, o.width, o.height, fronts, { style: 'flat', materialId: FRONT }) : [],
  }
}

const base = (id: string, width: number, fronts: Parameters<typeof makeFronts>[3], extra: Partial<CabinetT> = {}) =>
  cab({ id, type: 'base', width, height: BASE_H, depth: BASE_D, elevation: PLINTH_H, ...extra }, fronts)

const upper = (id: string, width: number, fronts: Parameters<typeof makeFronts>[3], extra: Partial<CabinetT> = {}) =>
  cab({ id, type: 'wall', width, height: 720, depth: WALL_D, elevation: WALL_ELEV, ...extra }, fronts)

export function exampleProject(): ProjectT {
  const now = new Date().toISOString()
  return {
    id: 'przyklad-kuchnia-L',
    name: 'Przykład — kuchnia w L',
    createdAt: now,
    updatedAt: now,
    version: SCHEMA_VERSION,
    units: 'mm',
    room: {
      width: 3865,
      depth: 3000,
      height: 2600,
      walls: [
        { id: 'A', length: 3865 },
        { id: 'B', length: 3000 },
        { id: 'C', length: 3865 },
        { id: 'D', length: 3000 },
      ],
      obstacles: [
        { id: 'murek-1', kind: 'murek', wallId: 'A', x: 0, y: 0, w: 205, h: 900, d: 210, label: 'Murek ~21 cm' },
        { id: 'okno-1', kind: 'window', wallId: 'B', x: 1900, y: 900, w: 900, h: 1400, d: 0, label: 'Okno' },
      ],
    },
    runs: [
      {
        id: 'A1',
        wallId: 'A',
        startOffset: 205, // za murkiem
        plinthHeight: PLINTH_H,
        plinthSetback: 50,
        layers: {
          base: [
            base('A-d1', 340, { kind: 'door' }),
            base('A-d2', 600, { kind: 'drawers', heights: [300, 260, 160] }),
            base('A-d3', 600, { kind: 'drawers', heights: [560, 160] }, { appliance: 'oven' }),
            base('A-d4', 450, { kind: 'door' }, { appliance: 'dishwasher', handle: { type: 'bar', position: 'top' } }),
            base('A-d5', 800, { kind: 'doors2' }, { appliance: 'sink' }),
            base('A-d6', 870, { kind: 'door' }, { type: 'corner' }),
          ],
          wall: [
            upper('A-g1', 340, { kind: 'door' }),
            upper('A-g2', 600, { kind: 'doors2' }),
            cab(
              {
                id: 'A-g3',
                type: 'appliance',
                appliance: 'hood',
                width: 600,
                height: 360,
                depth: WALL_D,
                elevation: 1810,
              },
              { kind: 'flap' },
            ),
            upper('A-g4', 450, { kind: 'door' }),
            upper('A-g5', 800, { kind: 'doors2' }),
            upper('A-g6', 870, { kind: 'door' }),
          ],
        },
        worktop: {
          thickness: 38,
          overhangFront: 20,
          materialId: 'worktop-oak',
          cutouts: [
            { kind: 'hob', x: 340 + 600 + 20, width: 560, depth: 490 },
            { kind: 'sink', x: 340 + 600 + 600 + 450 + 50, width: 700, depth: 480 },
          ],
        },
      },
      {
        id: 'B1',
        wallId: 'B',
        startOffset: 600, // narożnik: pomijamy głębokość ciągu A (blat 600)
        plinthHeight: PLINTH_H,
        plinthSetback: 50,
        layers: {
          base: [base('B-d1', 450, { kind: 'drawers', heights: [180, 270, 270] })],
        },
        worktop: { thickness: 38, overhangFront: 20, materialId: 'worktop-oak', cutouts: [] },
      },
      {
        id: 'B2',
        wallId: 'B',
        startOffset: 1050,
        plinthHeight: PLINTH_H,
        plinthSetback: 50,
        layers: {
          tall: [
            cab(
              {
                id: 'B-s1',
                type: 'tall',
                appliance: 'fridge',
                width: 600,
                height: 2070,
                depth: BASE_D,
                elevation: PLINTH_H,
              },
              { kind: 'drawers', heights: [1340, 730], as: 'door-right' },
            ),
            cab(
              { id: 'B-s2', type: 'filler', width: 55, height: 2070, depth: BASE_D, elevation: PLINTH_H },
              { kind: 'door' },
            ),
          ],
        },
      },
    ],
    materials: [
      {
        id: FRONT,
        name: 'Lakier biały mat (MDF)',
        category: 'lacquer',
        finish: 'matt',
        color: '#f1efe9',
        roughness: 0.6,
        metalness: 0,
      },
      {
        id: CARCASS,
        name: 'Płyta laminowana biała',
        category: 'laminate',
        finish: 'matt',
        color: '#e6e6e3',
        roughness: 0.7,
        metalness: 0,
      },
      {
        id: 'worktop-oak',
        name: 'Blat dąb (laminat)',
        category: 'laminate',
        finish: 'structured',
        color: '#b08a5a',
        roughness: 0.55,
        metalness: 0,
      },
    ],
  }
}
