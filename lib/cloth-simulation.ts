/**
 * Cloth Simulation - Verlet + position-based distance constraints.
 *
 * Architecture ported from the proven FlagWaver reference engine and adapted
 * to typed-array storage for better cache locality. Works identically under
 * the WebGL and WebGPU renderers exposed by flag-scene.tsx.
 *
 * Per substep:
 *   1. Apply gravity (force / mass = acceleration)
 *   2. Apply wind per-particle:
 *        - Compute local triangle normal from immediate neighbours.
 *        - Modulate by sin-wave turbulence and |normal . windDir|.
 *   3. Verlet integration: new = pos + (pos - prev) * 0.99 + accel * dt^2
 *   4. Iterate (10 passes) over distance constraints, projecting positions
 *      back to rest length with stiffness factor.
 *   5. Pole / floor / self-collision passes (if enabled).
 */

import * as THREE from 'three'

export interface ClothParams {
  width: number
  height: number
  segmentsX: number
  segmentsY: number

  // Area density (kg/m^2). Per-particle mass = mass * cellArea, so dynamics
  // stay roughly invariant when the mesh is refined.
  mass: number
  gravity: number
  windSpeed: number
  windDirection: number
  gustAmount: number

  // Overall stretch stiffness slider (0..1). Used as fallback for both
  // warp and weft axes when no anisotropic override is provided.
  stretchStiffness: number
  // Optional per-axis stiffness (real woven fabric is anisotropic).
  warpStiffness?: number    // horizontal (along x)
  weftStiffness?: number    // vertical   (along y)
  bendStiffness: number
  // Hard cap on stretch elongation (e.g. 0.1 = 10%). Defaults to 0.1.
  strainLimit?: number

  damping: number
  // Aerodynamic drag scalar (Cd * rho_air, lumped). Used by the signed
  // pressure model in the wind pass.
  drag: number

  collisionsEnabled: boolean
  floorY: number
  poleRadius: number
  selfCollisionDistance: number

  // Optional extra cylindrical pole colliders in cloth-local coordinates,
  // used e.g. so each flag in dual-pole mode collides against the *other*
  // pole.
  extraPoles?: Array<{ x: number; z: number; radius: number }>

  // World-space Y offset applied by an outer wrapper group (e.g. the scale
  // compensation group in flag-scene). The simulator subtracts this when
  // interpreting world-space targets like the floor plane and the lowered
  // position so they remain anchored in world space regardless of scale.
  worldYOffset?: number
  // Unscaled flag height. Used so a downscaled flag's lowered position and
  // floor collision land at the same world Y as a full-size flag instead of
  // tracking the shrunken cloth-local extents. Defaults to `height`.
  fullHeight?: number
}

export interface ClothPreset {
  name: string
  params: Partial<ClothParams>
}

// Per-preset warp/weft anisotropy: real flags are noticeably more
// compliant along the weft (vertical) than along the warp (horizontal
// load-bearing direction). The asymmetry breaks the symmetric trampoline
// response of an isotropic membrane and is a large part of what reads as
// "cloth" rather than "rubber sheet".
export const CLOTH_PRESETS: ClothPreset[] = [
  { name: 'Polyester', params: { mass: 0.15, stretchStiffness: 0.85, warpStiffness: 0.9,  weftStiffness: 0.7,  bendStiffness: 0.08, damping: 0.008, drag: 0.11 } },
  { name: 'Cotton',    params: { mass: 0.2,  stretchStiffness: 0.8,  warpStiffness: 0.86, weftStiffness: 0.66, bendStiffness: 0.1,  damping: 0.01,  drag: 0.12 } },
  { name: 'Canvas',    params: { mass: 0.35, stretchStiffness: 0.92, warpStiffness: 0.95, weftStiffness: 0.8,  bendStiffness: 0.14, damping: 0.014, drag: 0.13 } },
  { name: 'Silk',      params: { mass: 0.08, stretchStiffness: 0.7,  warpStiffness: 0.78, weftStiffness: 0.55, bendStiffness: 0.04, damping: 0.006, drag: 0.09 } },
  { name: 'Nylon',     params: { mass: 0.12, stretchStiffness: 0.82, warpStiffness: 0.88, weftStiffness: 0.68, bendStiffness: 0.06, damping: 0.007, drag: 0.105 } },
]

export const DEFAULT_PARAMS: ClothParams = {
  width: 3,
  height: 2,
  segmentsX: 70,
  segmentsY: 47,
  mass: 0.15,
  gravity: 9.81,
  windSpeed: 5,
  windDirection: 0,
  gustAmount: 0.3,
  stretchStiffness: 0.85,
  warpStiffness: 0.9,
  weftStiffness: 0.7,
  bendStiffness: 0.08,
  damping: 0.008,
  drag: 0.11,
  collisionsEnabled: false,
  floorY: 0,
  // Default pole radius is slightly larger than the visual pole (0.03) so that
  // the cloth body can actually wrap and rest against it instead of clipping
  // through. Tune via the control panel for thicker poles.
  poleRadius: 0.08,
  // Default self-collision distance: set to minimum 0.02 when collisions are enabled
  // for tighter contact detection.
  selfCollisionDistance: 0.02,
}

export const POLE_EXTRA_HEIGHT = 2.0
export const POLE_HEIGHT_MULTIPLIER = 1.5
export const FLAG_TOP_CLEARANCE = 0.08
export const FLAG_LOWERED_OFFSET = 0.5

export type FlagPosition = 'raised' | 'half-mast' | 'lowered'

export interface FlagPositionCommand {
  position: FlagPosition
  duration: number
  trigger: number
}

export function getPoleHeight(flagHeight: number): number {
  return (flagHeight + POLE_EXTRA_HEIGHT) * POLE_HEIGHT_MULTIPLIER
}

const STRETCH = 0
const SHEAR   = 1

// Stretch axis tags (used for warp/weft anisotropy).
const AXIS_WARP = 0  // horizontal (along x)
const AXIS_WEFT = 1  // vertical   (along y)

// Number of sequential self-collision passes per substep.
const SELF_COLLISION_PASSES = 16

// Per-constraint structural damping coefficients. Applied as `prev += β·Δp`
// alongside each XPBD position correction: damps velocity along the
// constraint direction without damping rigid-body motion.
const STRETCH_DAMP = 0.02
const SHEAR_DAMP   = 0.015
// Bend damping intentionally tiny: damping bending kills the small-scale
// curvature changes that give cloth its characteristic ripple. A rubber
// sheet has heavy bend damping; cloth does not.
const BEND_DAMP    = 0.005

// XPBD compliance ranges. The stiffness slider (0..1) maps to
// α = (1-s)^3 · K_MAX + EPS, so s=1 is nearly rigid (independent of
// iteration count) and s=0 is very compliant.
// Stretch is intentionally very stiff: real woven fabric is essentially
// inextensible (~1-2% under load). Shear is much more compliant — fabric
// shears easily, which is what lets it drape, crumple, and form folds
// instead of behaving like a membrane.
const COMPLIANCE_STRETCH = 3e-4
const COMPLIANCE_SHEAR   = 2e-2
// Bend is deliberately very compliant: iterating the linearised dihedral
// bend constraint acts as a Laplacian smoother on the mesh, and over many
// solver iterations that smoothing erases the small-scale curvature that
// gives cloth its characteristic creases. A higher compliance value (paired
// with a low `bendIter` count) lets folds form and persist instead of being
// flattened by the bend pass.
const COMPLIANCE_BEND    = 3e-1
const COMPLIANCE_EPS     = 1e-9

const DEFAULT_STRAIN_LIMIT = 0.02  // 2% max elongation per stretch spring

// Deterministic PRNG used for the initial 2D mesh perturbation and the
// constraint-iteration permutation. Avoids Math.random so behaviour is
// reproducible across reloads.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export class ClothSimulation {
  params: ClothParams
  
  // --- Adaptive collision distance for anisotropic grids ------------------
  // When width != height with fixed segmentation, particle spacing becomes
  // anisotropic. We compute the effective collision distance based on the
  // minimum particle spacing to prevent over-aggressive collisions in the
  // direction with tighter spacing.
  private effectiveSelfCollisionDistance: number = 0

  // --- Particle data (flat typed arrays) -----------------------------------
  private pos!:     Float32Array
  private prev!:    Float32Array
  private invMass!: Float32Array  // 0 for pinned, 1/m otherwise
  private baseY!:   Float32Array
  private pinned!:  Uint8Array

  // --- Distance constraint data (stretch + shear) --------------------------
  private sprA!:          Int32Array
  private sprB!:          Int32Array
  private sprRest!:       Float32Array
  private sprRest0!:      Float32Array  // original (woven) rest length
  private sprType!:       Uint8Array
  private sprAxis!:       Uint8Array    // meaningful for STRETCH only
  private sprCompliance!: Float32Array
  private sprDamping!:    Float32Array
  private sprLambda!:     Float32Array  // XPBD multiplier; reset each substep
  private sprOrder!:      Int32Array    // shuffled iteration order

  // --- Bend triple constraint data (3 particles per element) ---------------
  // Linearised dihedral / discrete curvature:
  //   C(p_a, p_m, p_c) = | p_m - 0.5*(p_a + p_c) |
  // Drives the mid-particle toward the midpoint of its two neighbours, which
  // captures real bending behaviour much better than the previous "distance
  // between i and i+2" springs (those resisted stretching across two cells,
  // not curvature).
  private bendA!:          Int32Array
  private bendM!:          Int32Array
  private bendC!:          Int32Array
  private bendCompliance!: Float32Array
  private bendLambda!:     Float32Array
  private bendOrder!:      Int32Array

  private particleCount = 0
  private springCount   = 0
  private bendCount     = 0

  // --- Scratch / output ----------------------------------------------------
  private normalsBuffer!: Float32Array
  private vtxNormals!:    Float32Array

  // --- Spatial hash (for self-collision neighbour lookup) ------------------
  private static readonly HASH_SIZE = 4096
  private hashTable!: Int32Array
  private hashNext!:  Int32Array

  // --- Wind state ----------------------------------------------------------
  private time = 0

  /** Number of self-collision contacts resolved in the most recent substep. */
  public lastSelfCollisionContacts = 0
  /** Total self-collision contacts since construction (rolling sum). */
  public totalSelfCollisionContacts = 0
  /** Number of extra-pole contacts resolved in the most recent substep. */
  public lastExtraPoleContacts = 0
  /** Total extra-pole contacts since construction (rolling sum). */
  public totalExtraPoleContacts = 0

  // --- Timing --------------------------------------------------------------
  private accumulator = 0
  private readonly fixedDt    = 1 / 60
  private readonly maxFrameDt = 1 / 20
  private readonly maxSubsteps = 3
  // With XPBD the visible stiffness is fixed by the compliance values rather
  // than the iteration count, so fewer iterations suffice than naive PBD.
  private readonly solverIter = 8
  // Bend is solved far fewer times per substep than stretch/shear. The bend
  // constraint mathematically behaves like a smoothing filter on mesh
  // curvature, so running it as often as the stretch constraint erases
  // folds; 2 passes is enough to keep the cloth stable without flattening
  // its creases.
  private readonly bendIter   = 2

  // --- Plasticity ----------------------------------------------------------
  // Cloth holds creases: once a fold has been held for a moment the fibres
  // take a set and the fold persists briefly even after the load is gone.
  // We approximate that by slowly drifting each spring's rest length toward
  // its current length, bounded by `PLASTIC_RANGE` from the woven length.
  // This kills the elastic "snap back to flat" character that otherwise
  // makes the cloth read as a rubber sheet.
  private plasticCounter = 0
  private readonly PLASTIC_EVERY      = 6      // substeps between drift passes
  private readonly PLASTIC_RATE       = 0.02   // fraction of (current - rest) absorbed per pass
  private readonly PLASTIC_RANGE      = 0.04   // ±4% drift cap (stretch springs)
  private readonly PLASTIC_SHEAR_RANGE = 0.08  // shear can take a larger set

  // --- Flag raising --------------------------------------------------------
  private flagYOffset   = 0
  private targetYOffset = 0
  private raiseSpeed    = 0.5

  constructor(params: ClothParams) {
    this.params = { ...params }
    this.flagYOffset   = this.getRaisedOffset()
    this.targetYOffset = this.flagYOffset
    this.allocateBuffers()
    this.initParticles()
    this.initConstraints()
    this.computeEffectiveCollisionDistance()
  }

  // --- Adaptive collision distance for anisotropic particle grids ----------
  /**
   * Computes the effective self-collision distance accounting for the cloth's
   * actual particle spacing. When width != height with fixed segmentation
   * (70x47), the particle grid becomes anisotropic. The collision distance is
   * scaled relative to the *minimum* particle spacing to prevent aggressive
   * over-collisions in the direction with tighter spacing.
   *
   * Example: 3x2 flag (default) has nearly isotropic spacing (~0.043 in both
   * directions). A 2x2 flag has 0.0286 in X and 0.0426 in Y—X becomes
   * compressed. The collision distance is adjusted to remain proportional to
   * the tightest axis.
   */
  private computeEffectiveCollisionDistance(): void {
    const { width, height, segmentsX, segmentsY } = this.params
    
    // Compute particle cell dimensions
    const cellX = width / segmentsX
    const cellY = height / segmentsY
    const minCellSize = Math.min(cellX, cellY)
    
    // Compute the reference cell size from the default 3x2 flag
    // (which was used to calibrate the default 0.17 collision distance)
    const refCellX = 3.0 / 70
    const refCellY = 2.0 / 47
    const refMinCellSize = Math.min(refCellX, refCellY)
    
    // Scale the collision distance proportionally to the actual cell size
    const cellSizeRatio = minCellSize / refMinCellSize
    this.effectiveSelfCollisionDistance = this.params.selfCollisionDistance * cellSizeRatio
  }
  
  // --- offsets -------------------------------------------------------------
  private getRaisedOffset(): number {
    return getPoleHeight(this.params.height) - this.params.height - FLAG_TOP_CLEARANCE
  }
  private getLoweredOffset(): number {
    // Anchor the cloth's bottom edge to the same world Y a full-size flag
    // would reach (`-fullHeight/2 + FLAG_LOWERED_OFFSET`), then convert back
    // into this cloth's local offset by accounting for its half-height and
    // any outer wrapper group offset. Without this, a scaled-down flag
    // hovers higher when lowered because it has less local extent below the
    // top attachment.
    const fullH = this.params.fullHeight ?? this.params.height
    const wOff  = this.params.worldYOffset ?? 0
    const targetBottomWorld = -fullH * 0.5 + FLAG_LOWERED_OFFSET
    return targetBottomWorld + this.params.height * 0.5 - wOff
  }
  private getHalfMastOffset(): number {
    return (this.getRaisedOffset() + this.getLoweredOffset()) / 2
  }

  // --- init ----------------------------------------------------------------
  private allocateBuffers(): void {
    const n = (this.params.segmentsX + 1) * (this.params.segmentsY + 1)
    this.particleCount = n
    this.pos           = new Float32Array(n * 3)
    this.prev          = new Float32Array(n * 3)
    this.invMass       = new Float32Array(n)
    this.baseY         = new Float32Array(n)
    this.pinned        = new Uint8Array(n)
    this.normalsBuffer = new Float32Array(n * 3)
    this.vtxNormals    = new Float32Array(n * 3)
    this.hashTable     = new Int32Array(ClothSimulation.HASH_SIZE)
    this.hashNext      = new Int32Array(n)
  }

  /**
   * Area-density mass model: per-particle mass = density * cellArea. Total
   * cloth mass = mass * width * height, so `params.mass` carries a real
   * physical unit (kg/m^2) and refining the mesh does not change the
   * effective bulk dynamics.
   */
  private computeParticleMass(): number {
    const { width, height, segmentsX, segmentsY } = this.params
    const cellArea = (width / segmentsX) * (height / segmentsY)
    return Math.max(1e-4, this.params.mass * cellArea)
  }

  private initParticles(): void {
    const { width, height, segmentsX, segmentsY } = this.params
    const m   = this.computeParticleMass()
    const imm = 1 / m
    const rng = mulberry32(0xC10C0)

    let i = 0
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const px = (x / segmentsX) * width
        const py = height * 0.5 - (y / segmentsY) * height + this.flagYOffset
        // 2D deterministic z perturbation (~1cm) so the cloth folds naturally
        // under gravity instead of collapsing to a planar sheet. Pinned
        // column stays exactly at z=0 to keep the attachment edge aligned.
        const pz = x === 0 ? 0 : (rng() - 0.5) * 0.02
        this.pos[i * 3]     = px
        this.pos[i * 3 + 1] = py
        this.pos[i * 3 + 2] = pz
        this.prev[i * 3]     = px
        this.prev[i * 3 + 1] = py
        this.prev[i * 3 + 2] = pz
        this.baseY[i]   = height * 0.5 - (y / segmentsY) * height
        this.pinned[i]  = (x === 0) ? 1 : 0
        this.invMass[i] = (x === 0) ? 0 : imm
        i++
      }
    }
  }

  private initConstraints(): void {
    const { segmentsX, segmentsY } = this.params
    const cols = segmentsX + 1

    // --- Distance constraints (stretch + shear) --------------------------
    const tempA: number[] = []
    const tempB: number[] = []
    const tempR: number[] = []
    const tempT: number[] = []
    const tempAx: number[] = []

    const addSpring = (a: number, b: number, type: number, axis: number) => {
      const ax = this.pos[a * 3],     ay = this.pos[a * 3 + 1], az = this.pos[a * 3 + 2]
      const bx = this.pos[b * 3],     by = this.pos[b * 3 + 1], bz = this.pos[b * 3 + 2]
      const dx = bx - ax, dy = by - ay, dz = bz - az
      tempA.push(a); tempB.push(b); tempT.push(type); tempAx.push(axis)
      tempR.push(Math.sqrt(dx * dx + dy * dy + dz * dz))
    }

    // Structural stretches (warp = horizontal, weft = vertical)
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const idx = y * cols + x
        if (x < segmentsX) addSpring(idx, idx + 1,    STRETCH, AXIS_WARP)
        if (y < segmentsY) addSpring(idx, idx + cols, STRETCH, AXIS_WEFT)
      }
    }
    // Shear diagonals
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        const idx = y * cols + x
        addSpring(idx,     idx + cols + 1, SHEAR, 0)
        addSpring(idx + 1, idx + cols,     SHEAR, 0)
      }
    }

    this.springCount   = tempA.length
    this.sprA          = new Int32Array(tempA)
    this.sprB          = new Int32Array(tempB)
    this.sprRest       = new Float32Array(tempR)
    this.sprRest0      = new Float32Array(tempR)
    this.sprType       = new Uint8Array(tempT)
    this.sprAxis       = new Uint8Array(tempAx)
    this.sprCompliance = new Float32Array(this.springCount)
    this.sprDamping    = new Float32Array(this.springCount)
    this.sprLambda     = new Float32Array(this.springCount)

    // --- Bend triples (linearised dihedral) ------------------------------
    const bA: number[] = []
    const bM: number[] = []
    const bC: number[] = []
    // Horizontal triples
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 1; x < segmentsX; x++) {
        const i = y * cols + x
        bA.push(i - 1); bM.push(i); bC.push(i + 1)
      }
    }
    // Vertical triples
    for (let y = 1; y < segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const i = y * cols + x
        bA.push(i - cols); bM.push(i); bC.push(i + cols)
      }
    }
    this.bendCount      = bA.length
    this.bendA          = new Int32Array(bA)
    this.bendM          = new Int32Array(bM)
    this.bendC          = new Int32Array(bC)
    this.bendCompliance = new Float32Array(this.bendCount)
    this.bendLambda     = new Float32Array(this.bendCount)

    // Shuffled iteration order (Fisher-Yates). Removes the directional bias
    // that fixed-order Gauss-Seidel introduces — without it, corrections
    // propagate consistently from one corner to the other and visibly stiffen
    // the cloth in that direction.
    this.sprOrder  = ClothSimulation.shuffledIndices(this.springCount, 0xBEEF1)
    this.bendOrder = ClothSimulation.shuffledIndices(this.bendCount,   0xBEEF2)

    this.applyStiffness()
  }

  private static shuffledIndices(n: number, seed: number): Int32Array {
    const arr = new Int32Array(n)
    for (let i = 0; i < n; i++) arr[i] = i
    const rng = mulberry32(seed)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp
    }
    return arr
  }

  /**
   * Map user stiffness sliders to XPBD compliance values. With XPBD, the
   * effective stiffness depends on compliance and timestep rather than the
   * iteration count, so the slider "feel" is consistent regardless of
   * solverIter. Warp/weft compliance differ when the user (or a preset)
   * provides anisotropic stiffness values.
   */
  private applyStiffness(): void {
    const sStretch = this.params.stretchStiffness
    const sWarp    = clamp01(this.params.warpStiffness ?? sStretch)
    const sWeft    = clamp01(this.params.weftStiffness ?? sStretch)
    // Real woven fabric is far more compliant in shear than in tension —
    // this is the single biggest difference between cloth and a rubber
    // sheet. Keep shear meaningfully softer than stretch.
    const sShear   = clamp01(sStretch * 0.35)
    const sBend    = clamp01(this.params.bendStiffness)

    const aWarp  = COMPLIANCE_STRETCH * Math.pow(1 - sWarp,  3) + COMPLIANCE_EPS
    const aWeft  = COMPLIANCE_STRETCH * Math.pow(1 - sWeft,  3) + COMPLIANCE_EPS
    const aShear = COMPLIANCE_SHEAR   * Math.pow(1 - sShear, 3) + COMPLIANCE_EPS
    const aBend  = COMPLIANCE_BEND    * Math.pow(1 - sBend,  3) + COMPLIANCE_EPS

    for (let s = 0; s < this.springCount; s++) {
      const t = this.sprType[s]
      if (t === STRETCH) {
        this.sprCompliance[s] = (this.sprAxis[s] === AXIS_WARP) ? aWarp : aWeft
        this.sprDamping[s]    = STRETCH_DAMP
      } else {
        this.sprCompliance[s] = aShear
        this.sprDamping[s]    = SHEAR_DAMP
      }
    }
    for (let b = 0; b < this.bendCount; b++) {
      this.bendCompliance[b] = aBend
    }
  }

  // --- Per-particle smooth normals (used by the wind pass) -----------------
  /**
   * Computes a quick smoothed normal for every particle by averaging the
   * cross-product of its two neighbour offsets (right - left, down - up).
   * Cheaper than full geometry normals because it skips per-triangle area
   * weighting; sufficient for wind interaction.
   */
  private computeParticleNormals(): void {
    const cols = this.params.segmentsX + 1
    const rows = this.params.segmentsY + 1
    const pos  = this.pos
    const out  = this.vtxNormals

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const i3 = i * 3
        // Neighbour indices, clamped
        const lx = x > 0        ? i - 1 : i + 1
        const rx = x < cols - 1 ? i + 1 : i - 1
        const uy = y > 0        ? i - cols : i + cols
        const dy = y < rows - 1 ? i + cols : i - cols

        const ex = pos[rx * 3]     - pos[lx * 3]
        const ey = pos[rx * 3 + 1] - pos[lx * 3 + 1]
        const ez = pos[rx * 3 + 2] - pos[lx * 3 + 2]
        const fx = pos[dy * 3]     - pos[uy * 3]
        const fy = pos[dy * 3 + 1] - pos[uy * 3 + 1]
        const fz = pos[dy * 3 + 2] - pos[uy * 3 + 2]

        let nx = ey * fz - ez * fy
        let ny = ez * fx - ex * fz
        let nz = ex * fy - ey * fx
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (len > 1e-8) { nx /= len; ny /= len; nz /= len }
        else            { nx = 0; ny = 0; nz = 1 }
        out[i3] = nx; out[i3 + 1] = ny; out[i3 + 2] = nz
      }
    }
  }

  // --- Simulation step -----------------------------------------------------
  private stepSimulation(dt: number): void {
    this.updateFlagPosition(dt)
    this.time += dt

    const { gravity, windSpeed, windDirection, gustAmount, drag, damping } = this.params
    const dtSq  = dt * dt
    const invDt = 1 / dt
    const n     = this.particleCount
    const pos   = this.pos
    const prev  = this.prev
    const invM  = this.invMass
    const pinned = this.pinned

    this.computeParticleNormals()
    const vn = this.vtxNormals

    // Wind base direction.
    const wdx = Math.cos(windDirection)
    const wdz = Math.sin(windDirection)
    const t   = this.time

    // Slow gust envelope: large-scale amplitude modulation on top of the
    // high-frequency turbulence. Two incommensurate frequencies avoid an
    // obvious repeat pattern.
    const gustEnv = 1 + gustAmount * (Math.sin(t * 0.31) * 0.55 + Math.sin(t * 0.073) * 0.45)
    // Pressure coefficient in acceleration units after dividing through by
    // area density: a = 0.5 * rho_air * Cd * v_rel^2 / density. `drag` plays
    // the role of (Cd * rho_air) and `mass` is the area density.
    const areaDensity = Math.max(1e-3, this.params.mass)
    const pressureK   = 0.6 * drag / areaDensity
    // Linear (skin-friction-like) component keeps the flag responsive at
    // very low wind speeds where the quadratic term vanishes.
    const linK = pressureK * 0.4

    // Global Verlet damping (rigid-body friendly, deliberately gentle). The
    // bulk of the constraint-aligned damping is done per-spring inside the
    // XPBD solver via the `prev += β·Δp` trick, so this only needs to bleed
    // off a tiny amount of free-flight motion.
    const dampFactor = Math.max(0.95, Math.min(0.9995, 1 - damping * 0.25))

    // Reset XPBD Lagrange multipliers for this substep.
    this.sprLambda.fill(0)
    this.bendLambda.fill(0)

    // --- Pass 1: apply forces -> Verlet integration ----------------------
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue
      const i3 = i * 3

      // Gravity is an acceleration, not a force.
      let ax = 0
      let ay = -gravity
      let az = 0

      // Particle velocity (Verlet finite difference).
      const vxp = (pos[i3]     - prev[i3])     * invDt
      const vyp = (pos[i3 + 1] - prev[i3 + 1]) * invDt
      const vzp = (pos[i3 + 2] - prev[i3 + 2]) * invDt

      // Advected turbulence: sample the gust pattern in a frame that moves
      // with the wind, so individual gusts visibly travel downwind across
      // the cloth instead of standing still in world space.
      //
      // The field is a sum of bands at different spatial frequencies:
      //   - w1/w2/w3 : low-frequency large-scale gust structure
      //   - w4/w5    : high-frequency fine-grained turbulence; this is what
      //                excites the cm-scale ripples that distinguish cloth
      //                flutter from a coherent membrane bulge
      //   - w6       : very-high-frequency, near-uncorrelated buffet jitter
      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2]
      const adv = windSpeed * t
      const ux  = px - wdx * adv
      const uz  = pz - wdz * adv
      const w1 = Math.sin(ux * 1.4 + py * 0.6)            * Math.cos(uz * 0.8 + py * 0.5)
      const w2 = Math.sin(ux * 2.7 - uz * 1.1 + t * 1.3)
      const w3 = Math.sin(py * 2.1 + t * 0.9)
      const w4 = Math.sin(ux * 6.3 + py * 4.1 + t * 2.7) * Math.cos(uz * 5.1 - py * 3.3 + t * 1.9)
      const w5 = Math.sin(ux * 9.7 - uz * 7.3 + t * 4.1)
      const w6 = Math.sin(ux * 17.0 + py * 13.0 + uz * 11.0 + t * 6.7)
      const turbLow  = (w1 * 0.55 + w2 * 0.3 + w3 * 0.15)
      const turbHigh = (w4 * 0.55 + w5 * 0.3 + w6 * 0.15)
      const turbulence = (turbLow + turbHigh * 0.6) * gustEnv

      // Effective wind velocity at this particle, with perpendicular and
      // vertical jitter so flutter has a true 3D component.
      const windMag = windSpeed * (1 + 0.35 * turbulence)
      const perpX = -wdz, perpZ = wdx
      const jitter = turbulence * windSpeed * 0.18
      // Lateral buffet: a small wind-perpendicular velocity component driven
      // by a *different* high-frequency noise band. Unlike the longitudinal
      // jitter above, this is not aligned with the bulk wind direction, so
      // it excites transverse modes of the cloth (cross-ripples, twisting
      // folds) that the coherent pressure model otherwise cannot reach.
      const buffetN = Math.sin(ux * 5.3 + py * 6.1 + t * 3.1) * Math.cos(uz * 4.7 - py * 5.9 + t * 2.3)
      const buffet  = buffetN * windSpeed * 0.22 * gustEnv
      const vwx = wdx * windMag + perpX * (jitter + buffet)
      const vwy = 0.06 * windSpeed * gustAmount * Math.sin(ux * 1.7 + t * 1.2)
         + windSpeed * 0.08 * Math.sin(ux * 4.9 + uz * 3.7 + t * 2.9) * gustEnv
      const vwz = wdz * windMag + perpZ * (jitter + buffet)

      // Relative wind in particle frame — crucial for self-sustaining
      // flutter, because a fold moving with the wind feels less force than
      // one moving against it.
      const rvx = vwx - vxp
      const rvy = vwy - vyp
      const rvz = vwz - vzp

      // Aerodynamic pressure with upwind/downwind asymmetry. The pure
      // `vrel_n · |vrel_n|` form is symmetric in the sign of vrel_n, which
      // corresponds to assuming the windward and leeward faces of a thin
      // cloth experience equal-magnitude pressures. Real flow separates on
      // the leeward face: stagnation pressure on the windward side is large
      // and positive, while the leeward side sees a much smaller (negative)
      // suction. The net normal pressure on a sheet element is therefore
      // biased — and that bias is what destabilises a flat configuration
      // into the propagating waves of a real fluttering flag
      // (Argentina & Mahadevan 2005, simplified). We model it by scaling the
      // negative branch of `vrel_n` down.
      const nx = vn[i3], ny = vn[i3 + 1], nz = vn[i3 + 2]
      const vrel_n = rvx * nx + rvy * ny + rvz * nz
      const asymK  = vrel_n >= 0 ? 1.0 : 0.55
      const pAcc   = pressureK * asymK * vrel_n * Math.abs(vrel_n) + linK * vrel_n
      ax += pAcc * nx
      ay += pAcc * ny
      az += pAcc * nz

      // Verlet: new = pos + (pos - prev) * dampFactor + accel * dt^2
      const vx = (pos[i3]     - prev[i3])     * dampFactor
      const vy = (pos[i3 + 1] - prev[i3 + 1]) * dampFactor
      const vz = (pos[i3 + 2] - prev[i3 + 2]) * dampFactor

      prev[i3]     = pos[i3]
      prev[i3 + 1] = pos[i3 + 1]
      prev[i3 + 2] = pos[i3 + 2]
      pos[i3]      += vx + ax * dtSq
      pos[i3 + 1]  += vy + ay * dtSq
      pos[i3 + 2]  += vz + az * dtSq
    }

    // --- Pass 2: XPBD constraint projection ------------------------------
    const sc       = this.springCount
    const bc       = this.bendCount
    const sprA     = this.sprA, sprB = this.sprB
    const sprRest  = this.sprRest
    const sprCompl = this.sprCompliance
    const sprDamp  = this.sprDamping
    const sprLam   = this.sprLambda
    const sprOrder = this.sprOrder
    const bA       = this.bendA, bM = this.bendM, bCi = this.bendC
    const bCompl   = this.bendCompliance
    const bLam     = this.bendLambda
    const bOrder   = this.bendOrder

    const collide = this.params.collisionsEnabled
    for (let iter = 0; iter < this.solverIter; iter++) {
      // Stretch + shear distance constraints (shuffled iteration order).
      for (let k = 0; k < sc; k++) {
        const s  = sprOrder[k]
        const a  = sprA[s], b = sprB[s]
        const a3 = a * 3,   b3 = b * 3

        const dx = pos[b3]     - pos[a3]
        const dy = pos[b3 + 1] - pos[a3 + 1]
        const dz = pos[b3 + 2] - pos[a3 + 2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < 1e-6) continue

        const nxn = dx / dist, nyn = dy / dist, nzn = dz / dist
        const C   = dist - sprRest[s]
        const wa  = invM[a], wb = invM[b]
        const wSum = wa + wb
        if (wSum === 0) continue

        const aTilde  = sprCompl[s] / dtSq
        const dLambda = (-C - aTilde * sprLam[s]) / (wSum + aTilde)
        sprLam[s] += dLambda

        const dpx = dLambda * nxn
        const dpy = dLambda * nyn
        const dpz = dLambda * nzn
        const beta = sprDamp[s]

        if (wa > 0) {
          pos[a3]      -= wa * dpx
          pos[a3 + 1]  -= wa * dpy
          pos[a3 + 2]  -= wa * dpz
          prev[a3]     -= wa * dpx * beta
          prev[a3 + 1] -= wa * dpy * beta
          prev[a3 + 2] -= wa * dpz * beta
        }
        if (wb > 0) {
          pos[b3]      += wb * dpx
          pos[b3 + 1]  += wb * dpy
          pos[b3 + 2]  += wb * dpz
          prev[b3]     += wb * dpx * beta
          prev[b3 + 1] += wb * dpy * beta
          prev[b3 + 2] += wb * dpz * beta
        }
      }

      // Bend triples: C = | p_m - 0.5*(p_a + p_c) |.
      // Only iterated `bendIter` times per substep — see field comment.
      if (iter < this.bendIter) {
      for (let k = 0; k < bc; k++) {
        const b  = bOrder[k]
        const ia = bA[b], im = bM[b], ic = bCi[b]
        const a3 = ia * 3, m3 = im * 3, c3 = ic * 3

        const dx = pos[m3]     - 0.5 * (pos[a3]     + pos[c3])
        const dy = pos[m3 + 1] - 0.5 * (pos[a3 + 1] + pos[c3 + 1])
        const dz = pos[m3 + 2] - 0.5 * (pos[a3 + 2] + pos[c3 + 2])
        const C  = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (C < 1e-6) continue
        const nxn = dx / C, nyn = dy / C, nzn = dz / C

        const wa = invM[ia], wm = invM[im], wc = invM[ic]
        const wSum = wm + 0.25 * (wa + wc)
        if (wSum === 0) continue

        const aTilde  = bCompl[b] / dtSq
        const dLambda = (-C - aTilde * bLam[b]) / (wSum + aTilde)
        bLam[b] += dLambda

        const dpx = dLambda * nxn
        const dpy = dLambda * nyn
        const dpz = dLambda * nzn

        if (wm > 0) {
          pos[m3]      += wm * dpx
          pos[m3 + 1]  += wm * dpy
          pos[m3 + 2]  += wm * dpz
          prev[m3]     += wm * dpx * BEND_DAMP
          prev[m3 + 1] += wm * dpy * BEND_DAMP
          prev[m3 + 2] += wm * dpz * BEND_DAMP
        }
        if (wa > 0) {
          pos[a3]      -= 0.5 * wa * dpx
          pos[a3 + 1]  -= 0.5 * wa * dpy
          pos[a3 + 2]  -= 0.5 * wa * dpz
          prev[a3]     -= 0.5 * wa * dpx * BEND_DAMP
          prev[a3 + 1] -= 0.5 * wa * dpy * BEND_DAMP
          prev[a3 + 2] -= 0.5 * wa * dpz * BEND_DAMP
        }
        if (wc > 0) {
          pos[c3]      -= 0.5 * wc * dpx
          pos[c3 + 1]  -= 0.5 * wc * dpy
          pos[c3 + 2]  -= 0.5 * wc * dpz
          prev[c3]     -= 0.5 * wc * dpx * BEND_DAMP
          prev[c3 + 1] -= 0.5 * wc * dpy * BEND_DAMP
          prev[c3 + 2] -= 0.5 * wc * dpz * BEND_DAMP
        }
      }
      }

      if (collide) this.applyPoleAndFloor()
    }

    // --- Strain limiting: hard-clamp stretch elongation ------------------
    // XPBD with non-zero compliance still allows some elongation under load;
    // this pass enforces a maximum stretch ratio (default 10%) so the cloth
    // cannot grow unboundedly even under extreme wind.
    const lim = this.params.strainLimit ?? DEFAULT_STRAIN_LIMIT
    if (lim > 0) {
      const maxFactor = 1 + lim
      for (let s = 0; s < sc; s++) {
        if (this.sprType[s] !== STRETCH) continue
        const a = sprA[s], b = sprB[s]
        const a3 = a * 3, b3 = b * 3
        const dx = pos[b3]     - pos[a3]
        const dy = pos[b3 + 1] - pos[a3 + 1]
        const dz = pos[b3 + 2] - pos[a3 + 2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const maxLen = sprRest[s] * maxFactor
        if (dist <= maxLen || dist < 1e-6) continue
        const wa = invM[a], wb = invM[b]
        const wSum = wa + wb
        if (wSum === 0) continue
        const excess = (dist - maxLen) / dist
        const ox = dx * excess, oy = dy * excess, oz = dz * excess
        if (wa > 0) {
          pos[a3]     += (wa / wSum) * ox
          pos[a3 + 1] += (wa / wSum) * oy
          pos[a3 + 2] += (wa / wSum) * oz
        }
        if (wb > 0) {
          pos[b3]     -= (wb / wSum) * ox
          pos[b3 + 1] -= (wb / wSum) * oy
          pos[b3 + 2] -= (wb / wSum) * oz
        }
      }
    }

    // --- Plastic rest-length drift ---------------------------------------
    // Run periodically (cheap, no per-substep cost when skipped). Each pass
    // nudges every spring's rest length a small fraction of the way toward
    // its currently observed length, clamped to a bounded range around the
    // original woven length. This gives the cloth "memory" of recent folds
    // without letting it deform unboundedly.
    if (++this.plasticCounter >= this.PLASTIC_EVERY) {
      this.plasticCounter = 0
      const rate0   = this.PLASTIC_RATE
      const rangeS  = this.PLASTIC_RANGE
      const rangeSh = this.PLASTIC_SHEAR_RANGE
      const rest0   = this.sprRest0
      const rest    = this.sprRest
      for (let s = 0; s < sc; s++) {
        const a = sprA[s], b = sprB[s]
        const a3 = a * 3, b3 = b * 3
        const dx = pos[b3]     - pos[a3]
        const dy = pos[b3 + 1] - pos[a3 + 1]
        const dz = pos[b3 + 2] - pos[a3 + 2]
        const cur = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const r0  = rest0[s]
        const range = this.sprType[s] === STRETCH ? rangeS : rangeSh
        const lo = r0 * (1 - range)
        const hi = r0 * (1 + range)
        let r = rest[s] + (cur - rest[s]) * rate0
        if (r < lo) r = lo
        else if (r > hi) r = hi
        rest[s] = r
      }
    }

    if (collide) {
      this.lastSelfCollisionContacts = 0
      for (let k = 0; k < SELF_COLLISION_PASSES; k++) this.applySelfCollision()
      this.totalSelfCollisionContacts += this.lastSelfCollisionContacts
    } else {
      this.lastSelfCollisionContacts = 0
    }
  }

  /**
   * Pole + floor + extra-pole collisions. Poles are treated as *finite*
   * cylinders (capped at the pole top) so particles above the pole top are
   * unaffected and naturally drape over the top instead of being pushed
   * radially outward at every height.
   */
  private applyPoleAndFloor(): void {
    const { floorY, poleRadius } = this.params
    const pos    = this.pos
    const prev   = this.prev
    const n      = this.particleCount
    const pinned = this.pinned
    // Compute the floor in world space (using the unscaled height so all
    // scales share the same plane), then map back into cloth-local Y by
    // subtracting the wrapper group's world offset.
    const fullH = this.params.fullHeight ?? this.params.height
    const wOff  = this.params.worldYOffset ?? 0
    const effFloorY = -fullH * 0.5 + floorY - wOff
    // Pole top in cloth local coordinates: pole base sits at -h/2.
    const poleTopY  = -this.params.height * 0.5 + getPoleHeight(this.params.height)
    const r2 = poleRadius * poleRadius
    const extras = this.params.extraPoles
    let extraContacts = 0

    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue
      const i3 = i * 3

      // Floor
      if (pos[i3 + 1] < effFloorY) {
        pos[i3 + 1] = effFloorY
        const friction = 0.5
        prev[i3]     = pos[i3]     - (pos[i3]     - prev[i3])     * friction
        prev[i3 + 2] = pos[i3 + 2] - (pos[i3 + 2] - prev[i3 + 2]) * friction
      }

      const aboveTop = pos[i3 + 1] >= poleTopY

      // Primary pole (capped cylinder centred at x=0, z=0).
      if (!aboveTop) {
        const px = pos[i3], pz = pos[i3 + 2]
        const dSq = px * px + pz * pz
        if (dSq < r2) {
          if (dSq > 1e-8) {
            const inv = poleRadius / Math.sqrt(dSq)
            pos[i3]     = px * inv
            pos[i3 + 2] = pz * inv
          } else {
            pos[i3]     = poleRadius
            pos[i3 + 2] = 0
          }
          const friction = 0.6
          prev[i3]     = pos[i3]     - (pos[i3]     - prev[i3])     * friction
          prev[i3 + 1] = pos[i3 + 1] - (pos[i3 + 1] - prev[i3 + 1]) * friction
          prev[i3 + 2] = pos[i3 + 2] - (pos[i3 + 2] - prev[i3 + 2]) * friction
        }
      }

      // Extra poles (e.g. the *other* flagpole in dual-flag mode).
      if (extras && !aboveTop) {
        for (let p = 0; p < extras.length; p++) {
          const ep = extras[p]
          const r  = ep.radius
          const ex = pos[i3]     - ep.x
          const ez = pos[i3 + 2] - ep.z
          const eSq = ex * ex + ez * ez
          if (eSq < r * r) {
            extraContacts++
            if (eSq > 1e-8) {
              const inv = r / Math.sqrt(eSq)
              pos[i3]     = ep.x + ex * inv
              pos[i3 + 2] = ep.z + ez * inv
            } else {
              pos[i3]     = ep.x + r
              pos[i3 + 2] = ep.z
            }
            const friction = 0.6
            prev[i3]     = pos[i3]     - (pos[i3]     - prev[i3])     * friction
            prev[i3 + 1] = pos[i3 + 1] - (pos[i3 + 1] - prev[i3 + 1]) * friction
            prev[i3 + 2] = pos[i3 + 2] - (pos[i3 + 2] - prev[i3 + 2]) * friction
          }
        }
      }
    }
    this.lastExtraPoleContacts = extraContacts
    this.totalExtraPoleContacts += extraContacts
  }

  /**
   * Self-collision using a spatial hash for neighbour lookup. Each particle
   * only checks the ~27 cells in its immediate neighbourhood instead of all
   * other particles, so we can iterate many passes cheaply.
   *
   * In addition to projecting overlapping particles apart, this also damps
   * the relative velocity along the contact normal (by nudging the Verlet
   * 'prev' position). Without that damping, two converging layers can have
   * enough inward velocity to fully cross between substeps and tunnel through
   * each other on the next frame.
   */
  private applySelfCollision(): void {
    const sdc = this.effectiveSelfCollisionDistance
    if (sdc <= 0) return

    const pos    = this.pos
    const prev   = this.prev
    const n      = this.particleCount
    const pinned = this.pinned
    const cols   = this.params.segmentsX + 1
    const sdc2   = sdc * sdc
    const inv    = 1 / sdc

    // --- Build spatial hash (linked-list buckets) ----------------------
    const table = this.hashTable
    const next  = this.hashNext
    table.fill(-1)
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const cx = Math.floor(pos[i3]     * inv)
      const cy = Math.floor(pos[i3 + 1] * inv)
      const cz = Math.floor(pos[i3 + 2] * inv)
      const h  = ClothSimulation.spatialHash(cx, cy, cz)
      next[i]  = table[h]
      table[h] = i
    }

    // --- Iterate neighbours --------------------------------------------
    const dampNormal      = 0.5   // fraction of inward relative velocity to remove
    const frictionTangent = 0.25  // fraction of tangential relative velocity to remove

    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const ri = (i / cols) | 0, ci = i - ri * cols
      const pi = pinned[i]
      const cx = Math.floor(pos[i3]     * inv)
      const cy = Math.floor(pos[i3 + 1] * inv)
      const cz = Math.floor(pos[i3 + 2] * inv)

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const h = ClothSimulation.spatialHash(cx + ox, cy + oy, cz + oz)
            let j = table[h]
            while (j !== -1) {
              // Each pair handled once (i < j) regardless of which cell
              // we entered through.
              if (j > i) {
                const rj = (j / cols) | 0, cjj = j - rj * cols
                // Skip the 3x3 mesh-neighbourhood: those are governed by
                // the structural / shear constraints already.
                if (Math.abs(ri - rj) > 1 || Math.abs(ci - cjj) > 1) {
                  const pj = pinned[j]
                  if (!(pi && pj)) {
                    const j3 = j * 3
                    const dx = pos[i3]     - pos[j3]
                    const dy = pos[i3 + 1] - pos[j3 + 1]
                    const dz = pos[i3 + 2] - pos[j3 + 2]
                    const d2 = dx * dx + dy * dy + dz * dz
                    if (d2 < sdc2 && d2 > 1e-8) {
                      this.lastSelfCollisionContacts++
                      const d   = Math.sqrt(d2)
                      const nxn = dx / d, nyn = dy / d, nzn = dz / d

                      // Mass-weighted position projection (pinned = infinite mass).
                      const wi   = pi ? 0 : 1
                      const wj   = pj ? 0 : 1
                      const wSum = wi + wj
                      const gap  = (sdc - d) / d
                      const si   = (wi / wSum) * gap
                      const sj   = (wj / wSum) * gap
                      if (wi) { pos[i3]     += dx * si; pos[i3 + 1] += dy * si; pos[i3 + 2] += dz * si }
                      if (wj) { pos[j3]     -= dx * sj; pos[j3 + 1] -= dy * sj; pos[j3 + 2] -= dz * sj }

                      // Relative velocity at the contact, decomposed into
                      // normal + tangential components.
                      const vrx = (pos[i3]     - prev[i3])     - (pos[j3]     - prev[j3])
                      const vry = (pos[i3 + 1] - prev[i3 + 1]) - (pos[j3 + 1] - prev[j3 + 1])
                      const vrz = (pos[i3 + 2] - prev[i3 + 2]) - (pos[j3 + 2] - prev[j3 + 2])
                      const vrn = vrx * nxn + vry * nyn + vrz * nzn
                      const vtx = vrx - vrn * nxn
                      const vty = vry - vrn * nyn
                      const vtz = vrz - vrn * nzn

                      // Normal damping: only when the layers are approaching,
                      // so we don't fight a natural separation impulse.
                      if (vrn < 0) {
                        const adj = vrn * dampNormal
                        const ai  = (wi / wSum) * adj
                        const aj  = (wj / wSum) * adj
                        if (wi) { prev[i3]     += ai * nxn; prev[i3 + 1] += ai * nyn; prev[i3 + 2] += ai * nzn }
                        if (wj) { prev[j3]     -= aj * nxn; prev[j3 + 1] -= aj * nyn; prev[j3 + 2] -= aj * nzn }
                      }
                      // Tangential friction: always bleed off some sliding
                      // velocity so stacked folds grip each other instead of
                      // sliding freely.
                      const fi = (wi / wSum) * frictionTangent
                      const fj = (wj / wSum) * frictionTangent
                      if (wi) { prev[i3]     += vtx * fi; prev[i3 + 1] += vty * fi; prev[i3 + 2] += vtz * fi }
                      if (wj) { prev[j3]     -= vtx * fj; prev[j3 + 1] -= vty * fj; prev[j3 + 2] -= vtz * fj }
                    }
                  }
                }
              }
              j = next[j]
            }
          }
        }
      }
    }
  }

  private static spatialHash(cx: number, cy: number, cz: number): number {
    // Standard 3D integer hash from Teschner et al. 2003.
    return (((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0)
         & (ClothSimulation.HASH_SIZE - 1)
  }

  private updateFlagPosition(dt: number): void {
    if (Math.abs(this.flagYOffset - this.targetYOffset) < 0.001) {
      this.flagYOffset = this.targetYOffset
      return
    }
    const dir = this.targetYOffset > this.flagYOffset ? 1 : -1
    this.flagYOffset += dir * this.raiseSpeed * dt
    if ((dir > 0 && this.flagYOffset > this.targetYOffset) ||
        (dir < 0 && this.flagYOffset < this.targetYOffset)) {
      this.flagYOffset = this.targetYOffset
    }
    const cols = this.params.segmentsX + 1
    for (let y = 0; y <= this.params.segmentsY; y++) {
      const i = y * cols
      const i3 = i * 3
      if (this.pinned[i]) {
        const newY = this.baseY[i] + this.flagYOffset
        this.pos[i3 + 1]  = newY
        this.prev[i3 + 1] = newY
      }
    }
  }

  // --- Public API ----------------------------------------------------------

  update(dt: number): void {
    const frameDt = Math.min(dt, this.maxFrameDt)
    this.accumulator = Math.min(this.accumulator + frameDt, this.fixedDt * this.maxSubsteps)
    let steps = 0
    while (this.accumulator >= this.fixedDt && steps < this.maxSubsteps) {
      this.stepSimulation(this.fixedDt)
      this.accumulator -= this.fixedDt
      steps++
    }
  }

  /**
   * Pre-settle the cloth by running N internal fixed-timestep substeps with
   * no real-time gating. Called once after construction so the cloth starts
   * in its equilibrium pose (a vertical drape under gravity, plus whatever
   * wind is configured) instead of flailing through several seconds of
   * transient motion when the scene first appears.
   *
   * Damping is forced to its hard cap (~0.85 per-step velocity retention)
   * for the duration of the warmup so transients decay quickly - with the
   * live damping (~0.988) a flat cloth dropped from rest under gravity
   * still has 50%+ residual velocity after 45 substeps, which is exactly
   * the "flag is bugged until some wind appears" symptom.
   */
  warmup(steps: number): void {
    const originalDamping = this.params.damping
    const originalGravity = this.params.gravity
    this.params.damping = 1.0
    this.params.gravity = originalGravity * 6
    const cols = this.params.segmentsX + 1
    const cornerIdx = this.params.segmentsY * cols + this.params.segmentsX
    const c3i = cornerIdx * 3
    const bx0 = this.pos[c3i], by0 = this.pos[c3i + 1]
    for (let i = 0; i < steps; i++) {
      this.stepSimulation(this.fixedDt)
    }
    const bx1 = this.pos[c3i], by1 = this.pos[c3i + 1], bz1 = this.pos[c3i + 2]
    // eslint-disable-next-line no-console
    console.log(
      `[cloth] warmup(${steps}) w=${this.params.segmentsX} drop: ` +
      `x ${bx0.toFixed(2)}->${bx1.toFixed(2)}, y ${by0.toFixed(2)}->${by1.toFixed(2)}, z=${bz1.toFixed(2)}`
    )
    this.params.damping = originalDamping
    this.params.gravity = originalGravity
    const n3 = this.particleCount * 3
    for (let i = 0; i < n3; i++) this.prev[i] = this.pos[i]
    this.accumulator = 0
  }

  updateParams(newParams: Partial<ClothParams>): void {
    Object.assign(this.params, newParams)
    this.applyStiffness()
    const m   = this.computeParticleMass()
    const imm = 1 / m
    for (let i = 0; i < this.particleCount; i++) {
      if (!this.pinned[i]) this.invMass[i] = imm
    }
    this.computeEffectiveCollisionDistance()
  }

  setFlagPosition(position: FlagPosition, duration: number): void {
    this.targetYOffset =
      position === 'raised'    ? this.getRaisedOffset()   :
      position === 'half-mast' ? this.getHalfMastOffset() :
                                  this.getLoweredOffset()
    this.raiseSpeed = Math.abs(this.targetYOffset - this.flagYOffset) / Math.max(duration, 0.1)
  }

  /**
   * Snap the flag instantly to the given position with no animation. All
   * particles (not just pinned ones) are shifted by the offset delta so the
   * cloth starts already at the right height instead of having to be dragged
   * down by the pinned edge over several frames.
   */
  snapFlagPosition(position: FlagPosition): void {
    const newOffset =
      position === 'raised'    ? this.getRaisedOffset()   :
      position === 'half-mast' ? this.getHalfMastOffset() :
                                  this.getLoweredOffset()
    const delta = newOffset - this.flagYOffset
    if (delta !== 0) {
      const n = this.particleCount
      for (let i = 0; i < n; i++) {
        const yi = i * 3 + 1
        this.pos[yi]  += delta
        this.prev[yi] += delta
      }
    }
    this.flagYOffset   = newOffset
    this.targetYOffset = newOffset
  }

  setFlagRaised(raised: boolean, duration: number): void {
    this.setFlagPosition(raised ? 'raised' : 'lowered', duration)
  }

  isFlagRaised(): boolean {
    return this.flagYOffset >= this.getRaisedOffset() - 0.1
  }

  getFlagYOffset(): number { return this.flagYOffset }

  reset(): void {
    this.time        = 0
    this.accumulator = 0
    this.flagYOffset   = this.getRaisedOffset()
    this.targetYOffset = this.flagYOffset
    this.raiseSpeed    = 0.5
    this.allocateBuffers()
    this.initParticles()
    this.initConstraints()
    this.computeEffectiveCollisionDistance()
  }

  getPositions(): Float32Array { return this.pos }

  computeNormals(): Float32Array {
    const { segmentsX, segmentsY } = this.params
    const cols    = segmentsX + 1
    const pos     = this.pos
    const normals = this.normalsBuffer
    normals.fill(0)

    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        const i0 = y * cols + x
        const i1 = i0 + 1
        const i2 = i0 + cols
        const i3 = i2 + 1
        const o0 = i0 * 3, o1 = i1 * 3, o2 = i2 * 3, o3 = i3 * 3

        // Triangle 1: i0, i1, i2
        const e1x = pos[o1] - pos[o0], e1y = pos[o1 + 1] - pos[o0 + 1], e1z = pos[o1 + 2] - pos[o0 + 2]
        const e2x = pos[o2] - pos[o0], e2y = pos[o2 + 1] - pos[o0 + 1], e2z = pos[o2 + 2] - pos[o0 + 2]
        const n1x = e1y * e2z - e1z * e2y
        const n1y = e1z * e2x - e1x * e2z
        const n1z = e1x * e2y - e1y * e2x
        normals[o0]   += n1x; normals[o0+1] += n1y; normals[o0+2] += n1z
        normals[o1]   += n1x; normals[o1+1] += n1y; normals[o1+2] += n1z
        normals[o2]   += n1x; normals[o2+1] += n1y; normals[o2+2] += n1z

        // Triangle 2: i1, i3, i2
        const e3x = pos[o3] - pos[o1], e3y = pos[o3 + 1] - pos[o1 + 1], e3z = pos[o3 + 2] - pos[o1 + 2]
        const e4x = pos[o2] - pos[o1], e4y = pos[o2 + 1] - pos[o1 + 1], e4z = pos[o2 + 2] - pos[o1 + 2]
        const n2x = e3y * e4z - e3z * e4y
        const n2y = e3z * e4x - e3x * e4z
        const n2z = e3x * e4y - e3y * e4x
        normals[o1]   += n2x; normals[o1+1] += n2y; normals[o1+2] += n2z
        normals[o3]   += n2x; normals[o3+1] += n2y; normals[o3+2] += n2z
        normals[o2]   += n2x; normals[o2+1] += n2y; normals[o2+2] += n2z
      }
    }

    const n = this.particleCount
    for (let i = 0; i < n; i++) {
      const o = i * 3
      const len = Math.sqrt(normals[o] * normals[o] + normals[o + 1] * normals[o + 1] + normals[o + 2] * normals[o + 2])
      if (len > 0) { normals[o] /= len; normals[o + 1] /= len; normals[o + 2] /= len }
    }
    return normals
  }
}