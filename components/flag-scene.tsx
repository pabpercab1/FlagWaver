'use client'

import { Suspense, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ClothMesh } from './cloth-mesh'
import { Flagpole } from './flagpole'
import { Ground } from './environment/ground'
import { Hills } from './environment/hills'
import { Clouds } from './environment/clouds'
import { SkyDome } from './environment/sky-dome'
import { ClothParams, FlagPositionCommand, getPoleHeight, FLAG_TOP_CLEARANCE } from '@/lib/cloth-simulation'

interface FlagSceneProps {
  params: ClothParams
  textureUrl: string | null
  secondTextureUrl: string | null
  thirdTextureUrl: string | null
  /** Optional independent width for the secondary flag (uses primary width when null). */
  secondaryWidth?: number | null
  tertiaryWidth?: number | null
  isSecondPoleEnabled: boolean
  isThirdPoleEnabled: boolean
  secondPoleDistance: number
  /** Per-flag size scale (0.5..1). Top edge stays fixed. */
  primaryScale?: number
  secondaryScale?: number
  tertiaryScale?: number
  isPaused: boolean
  resetTrigger: number
  primaryRaiseCommand: FlagPositionCommand | null
  secondaryRaiseCommand: FlagPositionCommand | null
  tertiaryRaiseCommand: FlagPositionCommand | null
  onBackendChange?: (backend: 'WebGPU' | 'WebGL') => void
}

interface CameraViewState {
  position: [number, number, number]
  target: [number, number, number]
}

const CAMERA_VIEW_STORAGE_KEY = 'flag-sim-camera-view'

function loadInitialCameraView(defaultTarget: [number, number, number]): CameraViewState {
  if (typeof window === 'undefined') {
    return {
      position: [4, 1.5, 4],
      target: defaultTarget
    }
  }

  try {
    const raw = window.localStorage.getItem(CAMERA_VIEW_STORAGE_KEY)
    if (!raw) {
      return {
        position: [4, 1.5, 4],
        target: defaultTarget
      }
    }

    const parsed = JSON.parse(raw) as CameraViewState
    if (
      !Array.isArray(parsed.position) ||
      !Array.isArray(parsed.target) ||
      parsed.position.length !== 3 ||
      parsed.target.length !== 3
    ) {
      return {
        position: [4, 1.5, 4],
        target: defaultTarget
      }
    }

    return {
      position: [parsed.position[0], parsed.position[1], parsed.position[2]],
      target: [parsed.target[0], parsed.target[1], parsed.target[2]]
    }
  } catch {
    return {
      position: [4, 1.5, 4],
      target: defaultTarget
    }
  }
}

/**
 * Main 3D scene containing the flag, flagpole, and environment
 */
export function FlagScene({
  params,
  textureUrl,
  secondTextureUrl,
  thirdTextureUrl,
  secondaryWidth,
  tertiaryWidth,
  isSecondPoleEnabled,
  isThirdPoleEnabled,
  secondPoleDistance,
  primaryScale = 1,
  secondaryScale = 1,
  tertiaryScale = 1,
  isPaused,
  resetTrigger,
  primaryRaiseCommand,
  secondaryRaiseCommand,
  tertiaryRaiseCommand,
  onBackendChange
}: FlagSceneProps) {
  const poleHeight = getPoleHeight(params.height)
  // Sim-local Y of the cloth's pinned top edge for a given cloth height
  // (mirrors `baseY[topRow] + getRaisedOffset()` inside ClothSimulation).
  // Used to compute the wrapper group offset so a scaled cloth's top edge
  // stays at the SAME world Y as the full-size flag's top edge.
  const topAttachY = (h: number) => h * 0.5 + getPoleHeight(h) - h - FLAG_TOP_CLEARANCE
  const fullTopY = topAttachY(params.height)
  const primaryClothH = params.height * primaryScale
  const primaryGroupY = fullTopY - topAttachY(primaryClothH)
  const secondaryClothH = params.height * secondaryScale
  const secondaryGroupY = fullTopY - topAttachY(secondaryClothH)
  const tertiaryClothH = params.height * tertiaryScale
  const tertiaryGroupY = fullTopY - topAttachY(tertiaryClothH)
  // Third pole is placed using the same spacing as the second pole, so the
  // distance between poles 2 and 3 matches the distance between poles 1 and 2.
  const thirdPoleZ = -secondPoleDistance * 2
  // Only the secondary pole counts as "extra" for collisions/awareness when
  // the third pole isn't enabled.
  const showThirdPole = isSecondPoleEnabled && isThirdPoleEnabled
  const controlsRef = useRef<{
    object: { position: { x: number; y: number; z: number } }
    target: { x: number; y: number; z: number }
  } | null>(null)
  const initialView = useMemo(
    () =>
      loadInitialCameraView([
        params.width / 2,
        0,
        showThirdPole
          ? thirdPoleZ / 2
          : isSecondPoleEnabled ? -secondPoleDistance / 2 : 0
      ]),
    []
  )

  const persistCameraView = () => {
    if (typeof window === 'undefined') return
    const controls = controlsRef.current
    if (!controls) return

    const view: CameraViewState = {
      position: [
        controls.object.position.x,
        controls.object.position.y,
        controls.object.position.z
      ],
      target: [controls.target.x, controls.target.y, controls.target.z]
    }

    window.localStorage.setItem(CAMERA_VIEW_STORAGE_KEY, JSON.stringify(view))
  }

  const createRenderer = useMemo(
    () =>
      async (props: { canvas: HTMLCanvasElement }) => {
        if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
          try {
            const { WebGPURenderer } = await import('three/webgpu')
            const renderer = new WebGPURenderer({
              canvas: props.canvas,
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance'
            } as never)

            await renderer.init()
            onBackendChange?.('WebGPU')
            return renderer
          } catch (error) {
            console.warn('WebGPU renderer initialization failed. Falling back to WebGL.', error)
          }
        }

        const THREE = await import('three')
        const renderer = new THREE.WebGLRenderer({
          canvas: props.canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false
        })
        onBackendChange?.('WebGL')
        return renderer
      },
    [onBackendChange]
  )

  return (
    <Canvas
      camera={{ position: initialView.position, fov: 45 }}
      dpr={[1, 1.5]}
      gl={createRenderer}
      style={{ background: 'transparent' }}
      frameloop={isPaused ? 'demand' : 'always'}
    >
      {/* Gradient sky dome + sun (WebGPU-compatible) */}
      <SkyDome sunPosition={[8, 12, 6]} />

      {/* Fog for depth */}
      <fog attach="fog" args={['#cfe2ef', 25, 90]} />
      
      {/* Lighting - bright daytime setup */}
      <ambientLight intensity={0.8} color="#ffffff" />
      
      {/* Main sun light */}
      <directionalLight
        position={[8, 12, 6]}
        intensity={2.0}
        color="#fffbe6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      
      {/* Fill light from opposite side */}
      <directionalLight
        position={[-5, 4, -3]}
        intensity={0.6}
        color="#add8e6"
      />
      
      {/* Sky hemisphere light */}
      <hemisphereLight
        color="#87ceeb"
        groundColor="#8b7355"
        intensity={0.6}
      />
      
      {/* Subtle rim light */}
      <pointLight
        position={[-3, 2, 5]}
        intensity={0.3}
        color="#ffffff"
      />

      <Suspense fallback={null}>
        <group position={[0, 0, 0]}>
          {/* Inner group shifts the scaled cloth so its pinned top edge
              lands at the same world Y as the full-size flag's top edge
              (still attached at the pole's flag-attachment point). */}
          {textureUrl && (
            <group position={[0, primaryGroupY, 0]}>
              <ClothMesh
                params={(() => {
                  const extraPoles: { x: number; z: number; radius: number }[] = []
                  const scaledPoleRadius = params.poleRadius * primaryScale
                  if (isSecondPoleEnabled) {
                    extraPoles.push({ x: 0, z: -secondPoleDistance, radius: scaledPoleRadius })
                  }
                  if (showThirdPole) {
                    extraPoles.push({ x: 0, z: thirdPoleZ, radius: scaledPoleRadius })
                  }
                  return extraPoles.length > 0
                    ? {
                        ...params,
                        width: params.width * primaryScale,
                        height: primaryClothH,
                        poleRadius: scaledPoleRadius,
                        selfCollisionDistance: params.selfCollisionDistance * primaryScale,
                        fullHeight: params.height,
                        worldYOffset: primaryGroupY,
                        extraPoles
                      }
                    : {
                        ...params,
                        width: params.width * primaryScale,
                        height: primaryClothH,
                        poleRadius: scaledPoleRadius,
                        selfCollisionDistance: params.selfCollisionDistance * primaryScale,
                        fullHeight: params.height,
                        worldYOffset: primaryGroupY
                      }
                })()}
                textureUrl={textureUrl}
                isPaused={isPaused}
                resetTrigger={resetTrigger}
                raiseCommand={primaryRaiseCommand}
              />
            </group>
          )}
          <Flagpole height={poleHeight} flagHeight={params.height} />
        </group>

        {isSecondPoleEnabled && (() => {
          const baseSecondaryWidth = secondaryWidth != null && secondaryWidth !== params.width
            ? secondaryWidth
            : params.width
          const scaledPoleRadiusSecondary = params.poleRadius * secondaryScale
          const extraPoles: { x: number; z: number; radius: number }[] = [
            // primary pole, in this group's local frame
            { x: 0, z: secondPoleDistance, radius: scaledPoleRadiusSecondary }
          ]
          if (showThirdPole) {
            // third pole at world z = thirdPoleZ; relative to this group at -secondPoleDistance
            extraPoles.push({ x: 0, z: thirdPoleZ + secondPoleDistance, radius: scaledPoleRadiusSecondary })
          }
          return (
            <group position={[0, 0, -secondPoleDistance]}>
              {secondTextureUrl && (
                <group position={[0, secondaryGroupY, 0]}>
                  <ClothMesh
                    params={{
                      ...params,
                      width: baseSecondaryWidth * secondaryScale,
                      height: secondaryClothH,
                      poleRadius: scaledPoleRadiusSecondary,
                      selfCollisionDistance: params.selfCollisionDistance * secondaryScale,
                      fullHeight: params.height,
                      worldYOffset: secondaryGroupY,
                      extraPoles
                    }}
                    textureUrl={secondTextureUrl}
                    isPaused={isPaused}
                    resetTrigger={resetTrigger}
                    raiseCommand={secondaryRaiseCommand}
                  />
                </group>
              )}
              <Flagpole height={poleHeight} flagHeight={params.height} />
            </group>
          )
        })()}

        {showThirdPole && (() => {
          const baseTertiaryWidth = tertiaryWidth != null && tertiaryWidth !== params.width
            ? tertiaryWidth
            : params.width
          const scaledPoleRadiusTertiary = params.poleRadius * tertiaryScale
          // Relative to this group at world z = thirdPoleZ
          const extraPoles: { x: number; z: number; radius: number }[] = [
            // primary pole at world z = 0 → local z = -thirdPoleZ
            { x: 0, z: -thirdPoleZ, radius: scaledPoleRadiusTertiary },
            // secondary pole at world z = -secondPoleDistance → local z = -secondPoleDistance - thirdPoleZ
            { x: 0, z: -secondPoleDistance - thirdPoleZ, radius: scaledPoleRadiusTertiary }
          ]
          return (
            <group position={[0, 0, thirdPoleZ]}>
              {thirdTextureUrl && (
                <group position={[0, tertiaryGroupY, 0]}>
                  <ClothMesh
                    params={{
                      ...params,
                      width: baseTertiaryWidth * tertiaryScale,
                      height: tertiaryClothH,
                      poleRadius: scaledPoleRadiusTertiary,
                      selfCollisionDistance: params.selfCollisionDistance * tertiaryScale,
                      fullHeight: params.height,
                      worldYOffset: tertiaryGroupY,
                      extraPoles
                    }}
                    textureUrl={thirdTextureUrl}
                    isPaused={isPaused}
                    resetTrigger={resetTrigger}
                    raiseCommand={tertiaryRaiseCommand}
                  />
                </group>
              )}
              <Flagpole height={poleHeight} flagHeight={params.height} />
            </group>
          )
        })()}
      </Suspense>

      {/* Ground + distant scenery */}
      <Ground y={-params.height / 2 - 0.1} />
      <Hills y={-params.height / 2 - 0.1} />
      <Clouds y={poleHeight + 4} />

      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        onChange={persistCameraView}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={15}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI - 0.1}
        target={initialView.target}
      />
    </Canvas>
  )
}
