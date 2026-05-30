'use client'

import dynamic from 'next/dynamic'
import { useFlagSimulation } from '@/hooks/use-flag-simulation'
import { ControlPanel } from '@/components/control-panel'
import { Flag, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef } from 'react'
import { processImage, ProcessedImage } from '@/lib/image-utils'

// Dynamic import for Three.js scene (no SSR)
const FlagScene = dynamic(
  () => import('@/components/flag-scene').then(mod => mod.FlagScene),
  { ssr: false }
)

/**
 * Main FlagWaver application
 */
export function FlagSimulator() {
  const {
    params,
    textureUrl,
    secondTextureUrl,
    thirdTextureUrl,
    secondaryWidth,
    tertiaryWidth,
    isPaused,
    resetTrigger,
    selectedPreset,
    userPresets,
    isInitialized,
    isSecondPoleEnabled,
    isThirdPoleEnabled,
    secondPoleDistance,
    primaryScale,
    secondaryScale,
    tertiaryScale,
    primaryFlagPosition,
    secondaryFlagPosition,
    tertiaryFlagPosition,
    raiseDuration,
    primaryRaiseCommand,
    secondaryRaiseCommand,
    tertiaryRaiseCommand,
    updateParams,
    handleImageChange,
    handleSecondImageChange,
    handleThirdImageChange,
    togglePause,
    reset,
    selectPreset,
    savePreset,
    loadPreset,
    setPrimaryFlagPosition,
    setSecondaryFlagPosition,
    setTertiaryFlagPosition,
    toggleSecondPoleEnabled,
    toggleThirdPoleEnabled,
    updateSecondPoleDistance,
    updatePrimaryScale,
    updateSecondaryScale,
    updateTertiaryScale,
    updateRaiseDuration
  } = useFlagSimulation()

  const [panelOpen, setPanelOpen] = useState(true)
  const [backend, setBackend] = useState<'WebGPU' | 'WebGL'>('WebGL')
  const bcRef = useRef<BroadcastChannel | null>(null)
  const auxWindowRef = useRef<Window | null>(null)
  const versionRef = useRef<number>(0)

  function openAuxWindow() {
    try {
      const features = 'width=900,height=700,toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes'
      const w = window.open('/aux-controls', 'FlagWaverControls', features)
      if (w) auxWindowRef.current = w
    } catch (e) {
      console.warn('Failed to open aux window', e)
    }
  }

  function broadcastState(bc?: BroadcastChannel | null) {
    const channel = bc || bcRef.current
    if (!channel) return
    versionRef.current += 1
    try {
      channel.postMessage({
        type: 'state',
        version: versionRef.current,
        payload: {
          params,
          isPaused,
          isSecondPoleEnabled,
          isThirdPoleEnabled,
          primaryScale,
          secondaryScale,
          tertiaryScale,
          primaryFlagPosition,
          secondaryFlagPosition,
          tertiaryFlagPosition,
          raiseDuration,
          textureUrl,
          secondTextureUrl,
          thirdTextureUrl,
          secondPoleDistance,
          selectedPreset,
          userPresets
        }
      })
    } catch (e) {
      // ignore
    }
  }

  // handle postMessage uploads from aux window (prefer transferables)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const msg = ev.data
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'uploadImage') {
        const { slot } = msg
        // If a Blob/File was transferred, it'll be present as msg.blob or structured as Blob in msg.blob
          if (msg.blob && typeof Blob !== 'undefined') {
          const b: Blob = msg.blob
          const file = new File([b], 'upload', { type: b.type || 'image/png' })
          processImage(file).then((processed: ProcessedImage) => {
            if (slot === 'primary') handleImageChange(processed)
            if (slot === 'secondary') handleSecondImageChange(processed)
            if (slot === 'tertiary') handleThirdImageChange(processed)
            versionRef.current += 1
            bcRef.current?.postMessage({ type: 'state', version: versionRef.current, payload: { params, isPaused } })
            }).catch(() => {})
        } else if (msg.processedImage) {
          const processed: ProcessedImage = msg.processedImage
          if (slot === 'primary') handleImageChange(processed)
          if (slot === 'secondary') handleSecondImageChange(processed)
          if (slot === 'tertiary') handleThirdImageChange(processed)
          broadcastState()
        }
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isPaused, handleImageChange, handleSecondImageChange, handleThirdImageChange])

  // Setup BroadcastChannel for aux-window <-> main-window communication
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    const bc = new BroadcastChannel('flag-controls')
    bcRef.current = bc

    bc.onmessage = (ev) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'requestInit') {
        // Aux window asks for initial state
        broadcastState(bc)
      }

      if (msg.type === 'command') {
        const { action, payload } = msg
        switch (action) {
                    case 'uploadImage': {
                      // payload: { slot: 'primary'|'secondary'|'tertiary', processedImage?: ProcessedImage }
                      if (payload?.processedImage) {
                        const processed: ProcessedImage = payload.processedImage
                        if (payload.slot === 'primary') handleImageChange(processed)
                        if (payload.slot === 'secondary') handleSecondImageChange(processed)
                        if (payload.slot === 'tertiary') handleThirdImageChange(processed)
                        broadcastState()
                      }
                      break
                    }
          case 'setParams':
            updateParams(payload)
            break
          case 'togglePause':
            togglePause()
            break
          case 'reset':
            reset()
            break
          case 'setSecondPole':
            if (typeof payload === 'boolean' && payload !== isSecondPoleEnabled) toggleSecondPoleEnabled()
            break
          case 'setThirdPole':
            if (typeof payload === 'boolean' && payload !== isThirdPoleEnabled) toggleThirdPoleEnabled()
            break
          case 'setPrimaryScale':
            updatePrimaryScale(payload)
            break
          case 'setSecondaryScale':
            updateSecondaryScale(payload)
            break
          case 'setTertiaryScale':
            updateTertiaryScale(payload)
            break
          case 'setPrimaryFlagPosition':
            setPrimaryFlagPosition(payload)
            break
          case 'setSecondaryFlagPosition':
            setSecondaryFlagPosition(payload)
            break
          case 'setTertiaryFlagPosition':
            setTertiaryFlagPosition(payload)
            break
          case 'setRaiseDuration':
            updateRaiseDuration(payload)
            break
          default:
            break
        }
      }
    }

    return () => {
      try {
        bc.close()
      } catch (e) {
        // ignore
      }
      bcRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [/* run once */])

  // Broadcast state updates to any aux windows
  useEffect(() => {
    broadcastState()
  }, [params, isPaused, isSecondPoleEnabled, isThirdPoleEnabled, primaryScale, secondaryScale, tertiaryScale, primaryFlagPosition, secondaryFlagPosition, tertiaryFlagPosition, raiseDuration])

  if (!isInitialized) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading simulation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Flag className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">FlagWaver</h1>
          </div>
        </div>
        
        {/* Control panel toggle (works on all screen sizes) */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanelOpen((prev) => !prev)}
            aria-label={panelOpen ? 'Hide controls' : 'Show controls'}
            aria-pressed={panelOpen}
          >
            {panelOpen ? (
              <PanelRightClose className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </Button>

          {/* Open controls in auxiliary window */}
          <Button
            variant="ghost"
            size="icon"
            onClick={openAuxWindow}
            aria-label="Open controls in new window"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
              <polyline points="17 3 21 3 21 7" />
              <path d="M10 14L21 3" />
            </svg>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 3D Viewer */}
        <main className="flex-1 relative">
          <div className="absolute inset-0">
            <FlagScene
              params={params}
              textureUrl={textureUrl}
              secondTextureUrl={secondTextureUrl}
              thirdTextureUrl={thirdTextureUrl}
              secondaryWidth={secondaryWidth}
              tertiaryWidth={tertiaryWidth}
              isSecondPoleEnabled={isSecondPoleEnabled}
              isThirdPoleEnabled={isThirdPoleEnabled}
              secondPoleDistance={secondPoleDistance}
              primaryScale={primaryScale}
              secondaryScale={secondaryScale}
              tertiaryScale={tertiaryScale}
              isPaused={isPaused}
              resetTrigger={resetTrigger}
              primaryRaiseCommand={primaryRaiseCommand}
              secondaryRaiseCommand={secondaryRaiseCommand}
              tertiaryRaiseCommand={tertiaryRaiseCommand}
              onBackendChange={setBackend}
            />
          </div>
          
          {/* Status overlay */}
          {isPaused && (
            <div className="absolute top-4 left-4 px-3 py-1.5 bg-background/80 backdrop-blur-sm rounded-lg border border-border">
              <span className="text-sm font-medium text-muted-foreground">Paused</span>
            </div>
          )}
        </main>

        {/* Control Panel - Desktop */}
        <aside
          className={`hidden lg:block h-full min-h-0 shrink-0 overflow-hidden border-l border-border transition-[width] duration-300 ${
            panelOpen ? 'w-80' : 'w-0'
          }`}
        >
          <ControlPanel
            params={params}
            onParamsChange={updateParams}
            isPaused={isPaused}
            onPauseToggle={togglePause}
            onReset={reset}
            currentImage={textureUrl}
            onImageChange={handleImageChange}
            secondImage={secondTextureUrl}
            onSecondImageChange={handleSecondImageChange}
            thirdImage={thirdTextureUrl}
            onThirdImageChange={handleThirdImageChange}
            selectedPreset={selectedPreset}
            onPresetSelect={selectPreset}
            userPresets={userPresets}
            onSavePreset={savePreset}
            onLoadPreset={loadPreset}
            isSecondPoleEnabled={isSecondPoleEnabled}
            isThirdPoleEnabled={isThirdPoleEnabled}
            secondPoleDistance={secondPoleDistance}
            onSecondPoleToggle={toggleSecondPoleEnabled}
            onThirdPoleToggle={toggleThirdPoleEnabled}
            onSecondPoleDistanceChange={updateSecondPoleDistance}
            primaryScale={primaryScale}
            secondaryScale={secondaryScale}
            tertiaryScale={tertiaryScale}
            onPrimaryScaleChange={updatePrimaryScale}
            onSecondaryScaleChange={updateSecondaryScale}
            onTertiaryScaleChange={updateTertiaryScale}
            primaryFlagPosition={primaryFlagPosition}
            secondaryFlagPosition={secondaryFlagPosition}
            tertiaryFlagPosition={tertiaryFlagPosition}
            raiseDuration={raiseDuration}
            onPrimaryFlagPositionChange={setPrimaryFlagPosition}
            onSecondaryFlagPositionChange={setSecondaryFlagPosition}
            onTertiaryFlagPositionChange={setTertiaryFlagPosition}
            onRaiseDurationChange={updateRaiseDuration}
            backend={backend}
          />
        </aside>

        {/* Control Panel - Mobile Overlay */}
        <div className="lg:hidden absolute inset-0 z-50 pointer-events-none">
          {/* Backdrop covers the full viewport; lives outside the sliding
              wrapper so it can't be dragged off-screen with the panel. */}
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
              panelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setPanelOpen(false)}
          />

          <div
            className={`absolute inset-y-0 right-0 w-80 max-w-[85vw] transition-transform duration-300 ${
              panelOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <aside className="h-full w-full pointer-events-auto overflow-hidden border-l border-border">
              <ControlPanel
                params={params}
                onParamsChange={updateParams}
                isPaused={isPaused}
                onPauseToggle={togglePause}
                onReset={reset}
                currentImage={textureUrl}
                onImageChange={handleImageChange}
                secondImage={secondTextureUrl}
                onSecondImageChange={handleSecondImageChange}
                thirdImage={thirdTextureUrl}
                onThirdImageChange={handleThirdImageChange}
                selectedPreset={selectedPreset}
                onPresetSelect={selectPreset}
                userPresets={userPresets}
                onSavePreset={savePreset}
                onLoadPreset={loadPreset}
                isSecondPoleEnabled={isSecondPoleEnabled}
                isThirdPoleEnabled={isThirdPoleEnabled}
                secondPoleDistance={secondPoleDistance}
                onSecondPoleToggle={toggleSecondPoleEnabled}
                onThirdPoleToggle={toggleThirdPoleEnabled}
                onSecondPoleDistanceChange={updateSecondPoleDistance}
                primaryScale={primaryScale}
                secondaryScale={secondaryScale}
                tertiaryScale={tertiaryScale}
                onPrimaryScaleChange={updatePrimaryScale}
                onSecondaryScaleChange={updateSecondaryScale}
                onTertiaryScaleChange={updateTertiaryScale}
                primaryFlagPosition={primaryFlagPosition}
                secondaryFlagPosition={secondaryFlagPosition}
                tertiaryFlagPosition={tertiaryFlagPosition}
                raiseDuration={raiseDuration}
                onPrimaryFlagPositionChange={setPrimaryFlagPosition}
                onSecondaryFlagPositionChange={setSecondaryFlagPosition}
                onTertiaryFlagPositionChange={setTertiaryFlagPosition}
                onRaiseDurationChange={updateRaiseDuration}
                backend={backend}
              />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
