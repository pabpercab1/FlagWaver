'use client'

import dynamic from 'next/dynamic'
import { useFlagSimulation } from '@/hooks/use-flag-simulation'
import { ControlPanel } from '@/components/control-panel'
import { Flag, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

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
            <p className="text-xs text-muted-foreground hidden sm:block">
              Realistic cloth physics simulation
            </p>
          </div>
        </div>
        
        {/* Control panel toggle (works on all screen sizes) */}
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
