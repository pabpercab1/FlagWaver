'use client'

import { useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ClothSimulation, ClothParams, FlagPositionCommand } from '@/lib/cloth-simulation'

interface ClothMeshProps {
  params: ClothParams
  textureUrl: string | null
  isPaused: boolean
  resetTrigger: number
  raiseCommand: FlagPositionCommand | null
}

/**
 * ClothMesh - renders the simulated cloth/flag.
 *
 * Texture loading mirrors the reference FlagWaver engine: TextureLoader.load is
 * called imperatively in a useEffect, and on completion the resulting Texture
 * is assigned directly to the material instance (with material.needsUpdate=true)
 * via a ref. This avoids re-renders that would recreate the material - which is
 * what was causing WebGPU's TextureNode to read null.matrix.
 */
export function ClothMesh({ params, textureUrl, isPaused, resetTrigger, raiseCommand }: ClothMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  const simulationRef = useRef<ClothSimulation | null>(null)
  const geometryRef = useRef<THREE.BufferGeometry | null>(null)
  const currentTextureRef = useRef<THREE.Texture | null>(null)
  const lastRaiseCommandRef = useRef<number | null>(null)
  // Latest raise command kept in a ref so the init effect can read it
  // without depending on it (which would rebuild the simulation on every
  // raise/lower toggle).
  const latestRaiseCommandRef = useRef<FlagPositionCommand | null>(null)
  const normalTickRef = useRef(0)

  useEffect(() => {
    latestRaiseCommandRef.current = raiseCommand
  }, [raiseCommand])

  // Imperative texture load - matches the reference engine pattern.
  useEffect(() => {
    const mat = materialRef.current
    if (!mat) return

    // Clear existing texture if URL is removed.
    if (!textureUrl) {
      if (currentTextureRef.current) {
        currentTextureRef.current.dispose()
        currentTextureRef.current = null
      }
      mat.map = null
      mat.color.set('#4a5568')
      mat.transparent = false
      mat.alphaTest = 0
      mat.depthWrite = true
      mat.needsUpdate = true
      return
    }

    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.load(
      textureUrl,
      (texture) => {
        if (cancelled) { texture.dispose(); return }

        // Dispose previous texture to prevent leaks.
        if (currentTextureRef.current) {
          currentTextureRef.current.dispose()
          currentTextureRef.current = null
        }

        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.colorSpace = THREE.SRGBColorSpace

        const liveMat = materialRef.current
        if (!liveMat) { texture.dispose(); return }
        liveMat.map = texture
        liveMat.color.set('#ffffff')
        // Enable alpha so PNG/WEBP transparency makes those areas of the
        // cloth invisible. alphaTest discards near-transparent fragments so
        // they don't write to the depth buffer and occlude the sky behind.
        liveMat.transparent = true
        liveMat.alphaTest = 0.5
        liveMat.depthWrite = true
        liveMat.needsUpdate = true
        currentTextureRef.current = texture
      },
      undefined,
      (err) => {
        console.warn('Failed to load flag texture:', err)
      }
    )

    return () => { cancelled = true }
  }, [textureUrl])

  // Dispose owned texture on unmount.
  useEffect(() => {
    return () => {
      if (currentTextureRef.current) {
        currentTextureRef.current.dispose()
        currentTextureRef.current = null
      }
    }
  }, [])

  // Initialize simulation on mount and reset. Uses useLayoutEffect (not
  // useEffect) so it runs synchronously after React commits the new geometry
  // but BEFORE the browser paints. Without this, swapping geometry (e.g.
  // when an uploaded image changes the flag width) lets R3F paint one frame
  // of the freshly-constructed flat PlaneGeometry before the next useFrame
  // tick writes simulated positions into it — visible as a brief snap to
  // the rest pose.
  useLayoutEffect(() => {
    const sim = new ClothSimulation(params)
    // If the flag is currently lowered or half-mast (e.g. user uploaded a new
    // image while the flag was down), spawn the new simulation already at
    // that position instead of letting it start raised and animate down.
    const pending = latestRaiseCommandRef.current
    if (pending && pending.position !== 'raised') {
      sim.snapFlagPosition(pending.position)
      lastRaiseCommandRef.current = pending.trigger
    } else {
      lastRaiseCommandRef.current = pending ? pending.trigger : null
    }
    // Pre-settle the cloth so the first rendered frame already shows its
    // equilibrium pose. Without this, starting with low/zero wind shows the
    // flat-horizontal initial mesh flailing through several seconds of
    // gravity-driven transients before it drapes naturally. The simulation
    // forces heavy damping internally during warmup so the cloth converges
    // quickly regardless of the user's live damping setting.
    sim.warmup(80)
    simulationRef.current = sim

    // Eagerly populate the just-constructed geometry with the warmed-up
    // positions/normals so the first paint shows the correct pose. Use the
    // closure `geometry` (always the current render's value) rather than
    // `geometryRef.current`, which still points at the previous geometry
    // because the ref-sync effect below hasn't run yet.
    const geo = geometry
    if (geo) {
      const posAttr = geo.attributes.position as THREE.BufferAttribute
      posAttr.array.set(sim.getPositions())
      posAttr.needsUpdate = true
      const normAttr = geo.attributes.normal as THREE.BufferAttribute
      normAttr.array.set(sim.computeNormals())
      normAttr.needsUpdate = true
    }
  }, [resetTrigger, params.segmentsX, params.segmentsY, params.width, params.height])

  // Update simulation parameters
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.updateParams(params)
    }
  }, [params])

  // Handle raise command
  useEffect(() => {
    if (raiseCommand && raiseCommand.trigger !== lastRaiseCommandRef.current) {
      if (!simulationRef.current) {
        simulationRef.current = new ClothSimulation(params)
      }
      simulationRef.current.setFlagPosition(raiseCommand.position, raiseCommand.duration)
      lastRaiseCommandRef.current = raiseCommand.trigger
    }
  }, [raiseCommand, params])

  // Create geometry with proper attributes
  const geometry = useMemo(() => {
    const { width, height, segmentsX, segmentsY } = params
    const geo = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY)

    // The geometry starts centered. Shift so the left edge is at x=0,
    // matching the simulation's coordinate system (pinned column at x=0).
    const positions = geo.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += width / 2
    }

    geo.attributes.position.setUsage(THREE.DynamicDrawUsage)
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage)
    geo.attributes.position.needsUpdate = true
    geo.attributes.uv.needsUpdate = true

    return geo
  }, [params.width, params.height, params.segmentsX, params.segmentsY])

  useLayoutEffect(() => {
    geometryRef.current = geometry
  }, [geometry])

  // Animation loop - update simulation and geometry
  const collisionLogRef = useRef({ frames: 0, contacts: 0, extras: 0, lastEnabled: false })
  useFrame((_, delta) => {
    if (!simulationRef.current || !geometryRef.current || isPaused) return

    simulationRef.current.update(delta)

    // Lightweight runtime verification that self-collision is firing.
    // Logs once per ~60 frames (~1s @ 60fps) only while collisions are on,
    // and emits a single line when the toggle flips, so you can confirm in
    // the browser console that the collision pass actually runs.
    const sim = simulationRef.current
    const log = collisionLogRef.current
    if (params.collisionsEnabled !== log.lastEnabled) {
      log.lastEnabled = params.collisionsEnabled
      log.frames = 0
      log.contacts = 0
      log.extras = 0
      if (params.collisionsEnabled) {
        console.info('[cloth] collisions enabled - self-collision pass active' +
          (params.extraPoles && params.extraPoles.length
            ? ` (+${params.extraPoles.length} extra pole(s) at ${params.extraPoles.map(p => `(x=${p.x.toFixed(2)},z=${p.z.toFixed(2)},r=${p.radius.toFixed(2)})`).join(', ')})`
            : ''))
      }
    }
    if (params.collisionsEnabled) {
      log.contacts += sim.lastSelfCollisionContacts
      log.extras   += sim.lastExtraPoleContacts
      log.frames++
      if (log.frames >= 60) {
        // console.log so it shows under Chrome's default 'Info' filter level
        // (console.debug is hidden unless 'Verbose' is enabled).
        const extraDesc = params.extraPoles && params.extraPoles.length
          ? `[${params.extraPoles.map(p => `(x=${p.x.toFixed(2)},z=${p.z.toFixed(2)},r=${p.radius.toFixed(2)})`).join(',')}]`
          : '[none]'
        console.log(
          `[cloth] last ${log.frames} frames: self-collision=${log.contacts} ` +
          `(avg ${(log.contacts / log.frames).toFixed(1)}/f, total ${sim.totalSelfCollisionContacts}), ` +
          `extra-pole=${log.extras} ` +
          `(avg ${(log.extras / log.frames).toFixed(1)}/f, total ${sim.totalExtraPoleContacts}) ` +
          `extras=${extraDesc}`
        )
        log.frames = 0
        log.contacts = 0
        log.extras = 0
      }
    }

    const positions = sim.getPositions()
    const positionAttribute = geometryRef.current.attributes.position as THREE.BufferAttribute
    positionAttribute.array.set(positions)
    positionAttribute.needsUpdate = true

    // Normals are expensive; update every other frame for denser meshes.
    const shouldUpdateNormals =
      params.segmentsX * params.segmentsY <= 320 || (normalTickRef.current++ & 1) === 0

    if (shouldUpdateNormals) {
      const normals = simulationRef.current.computeNormals()
      const normalAttribute = geometryRef.current.attributes.normal as THREE.BufferAttribute
      normalAttribute.array.set(normals)
      normalAttribute.needsUpdate = true
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        ref={materialRef}
        side={THREE.DoubleSide}
        roughness={0.8}
        metalness={0.05}
        color="#4a5568"
      />
    </mesh>
  )
}