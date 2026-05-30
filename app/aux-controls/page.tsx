'use client'

import { useEffect, useState, useRef } from 'react'
import { ControlPanel } from '@/components/control-panel'
import { ClothParams, ClothPreset, FlagPosition } from '@/lib/cloth-simulation'
import { ProcessedImage } from '@/lib/image-utils'

export default function AuxControlsPage() {
  const bcRef = useRef<BroadcastChannel | null>(null)
  const versionRef = useRef<number>(0)
  const [ready, setReady] = useState(false)
  const [params, setParams] = useState<ClothParams | any>({})
  const [isPaused, setIsPaused] = useState(false)
  const [isSecondPoleEnabled, setIsSecondPoleEnabled] = useState(false)
  const [isThirdPoleEnabled, setIsThirdPoleEnabled] = useState(false)
  const [primaryScale, setPrimaryScale] = useState(1)
  const [secondaryScale, setSecondaryScale] = useState(1)
  const [tertiaryScale, setTertiaryScale] = useState(1)
  const [primaryFlagPosition, setPrimaryFlagPosition] = useState<FlagPosition>('raised')
  const [secondaryFlagPosition, setSecondaryFlagPosition] = useState<FlagPosition>('raised')
  const [tertiaryFlagPosition, setTertiaryFlagPosition] = useState<FlagPosition>('raised')
  const [raiseDuration, setRaiseDuration] = useState(2)
  const [textureUrl, setTextureUrl] = useState<string | null>(null)
  const [secondTextureUrl, setSecondTextureUrl] = useState<string | null>(null)
  const [thirdTextureUrl, setThirdTextureUrl] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    const bc = new BroadcastChannel('flag-controls')
    bcRef.current = bc

    bc.onmessage = (ev) => {
      const msg = ev.data
      if (!msg || typeof msg !== 'object') return

        if (msg.type === 'state' && msg.payload) {
        // version check
        if (typeof msg.version === 'number' && msg.version <= versionRef.current) return
        if (typeof msg.version === 'number') versionRef.current = msg.version

        const s = msg.payload
        if (s.params) setParams(s.params)
        if (typeof s.isPaused === 'boolean') setIsPaused(s.isPaused)
        if (typeof s.isSecondPoleEnabled === 'boolean') setIsSecondPoleEnabled(s.isSecondPoleEnabled)
        if (typeof s.isThirdPoleEnabled === 'boolean') setIsThirdPoleEnabled(s.isThirdPoleEnabled)
        if (typeof s.primaryScale === 'number') setPrimaryScale(s.primaryScale)
        if (typeof s.secondaryScale === 'number') setSecondaryScale(s.secondaryScale)
        if (typeof s.tertiaryScale === 'number') setTertiaryScale(s.tertiaryScale)
        if (s.primaryFlagPosition) setPrimaryFlagPosition(s.primaryFlagPosition)
        if (s.secondaryFlagPosition) setSecondaryFlagPosition(s.secondaryFlagPosition)
        if (s.tertiaryFlagPosition) setTertiaryFlagPosition(s.tertiaryFlagPosition)
        if (typeof s.raiseDuration === 'number') setRaiseDuration(s.raiseDuration)
          if (typeof s.textureUrl === 'string') setTextureUrl(s.textureUrl)
          if (typeof s.secondTextureUrl === 'string') setSecondTextureUrl(s.secondTextureUrl)
          if (typeof s.thirdTextureUrl === 'string') setThirdTextureUrl(s.thirdTextureUrl)
        setReady(true)
      }
    }

    // request initial state from main window
    try {
      bc.postMessage({ type: 'requestInit' })
    } catch (e) {
      // ignore
    }

    return () => {
      try { bc.close() } catch (e) {}
      bcRef.current = null
    }
  }, [])

  // wrapper handlers send commands to the main window via BroadcastChannel
  const post = (action: string, payload?: any) => {
    const bc = bcRef.current
    if (!bc) return
    bc.postMessage({ type: 'command', action, payload })
  }
  const handleParamsChange = (p: Partial<ClothParams>) => post('setParams', p)
  const handlePauseToggle = () => post('togglePause')
  const handleReset = () => post('reset')
  const handleSecondPoleToggle = (checked?: boolean) => post('setSecondPole', typeof checked === 'boolean' ? checked : !isSecondPoleEnabled)
  const handleThirdPoleToggle = (checked?: boolean) => post('setThirdPole', typeof checked === 'boolean' ? checked : !isThirdPoleEnabled)
  const handlePrimaryScale = (v: number) => post('setPrimaryScale', v)
  const handleSecondaryScale = (v: number) => post('setSecondaryScale', v)
  const handleTertiaryScale = (v: number) => post('setTertiaryScale', v)
  const handlePrimaryFlagPosition = (pos: FlagPosition) => post('setPrimaryFlagPosition', pos)
  const handleSecondaryFlagPosition = (pos: FlagPosition) => post('setSecondaryFlagPosition', pos)
  const handleTertiaryFlagPosition = (pos: FlagPosition) => post('setTertiaryFlagPosition', pos)
  const handleRaiseDuration = (v: number) => post('setRaiseDuration', v)

  // Image sending: try postMessage to opener with Blob, fallback to BroadcastChannel with processedImage
  const sendImageToMain = async (slot: 'primary'|'secondary'|'tertiary', processed: ProcessedImage) => {
    try {
      if (typeof window !== 'undefined' && window.opener && window.opener !== window) {
        // convert dataUrl to blob then postMessage
        const res = await fetch(processed.dataUrl)
        const blob = await res.blob()
        try {
          window.opener.postMessage({ type: 'uploadImage', slot, blob }, '*')
          return
        } catch (e) {
          // fallback to BroadcastChannel
        }
      }
    } catch (e) {
      // ignore and fallback to bc
    }

    // fallback: send processed image via BroadcastChannel
    post('uploadImage', { slot, processedImage: processed })
  }

  const handlePrimaryImageChange = (processed: ProcessedImage | null) => {
    if (!processed) return
    sendImageToMain('primary', processed)
  }
  const handleSecondImageChangeLocal = (processed: ProcessedImage | null) => {
    if (!processed) return
    sendImageToMain('secondary', processed)
  }
  const handleThirdImageChangeLocal = (processed: ProcessedImage | null) => {
    if (!processed) return
    sendImageToMain('tertiary', processed)
  }

  return (
    <div className="h-screen w-screen bg-background">
      <div className="max-w-[900px] mx-auto h-full">
        <h1 className="p-4 text-lg font-semibold">FlagWaver — Controls (aux window)</h1>
        {!ready && (
          <div className="p-4 text-sm text-muted-foreground">Waiting for main window to supply initial state...</div>
        )}

        <div className="h-[calc(100%-64px)] border-t border-border">
          <ControlPanel
            params={params}
            onParamsChange={handleParamsChange}
            isPaused={isPaused}
            onPauseToggle={handlePauseToggle}
            onReset={handleReset}
            currentImage={textureUrl}
            onImageChange={handlePrimaryImageChange}
            secondImage={secondTextureUrl}
            onSecondImageChange={handleSecondImageChangeLocal}
            thirdImage={thirdTextureUrl}
            onThirdImageChange={handleThirdImageChangeLocal}
            selectedPreset={null}
            onPresetSelect={() => {}}
            userPresets={[]}
            onSavePreset={() => {}}
            onLoadPreset={() => {}}
            isSecondPoleEnabled={isSecondPoleEnabled}
            isThirdPoleEnabled={isThirdPoleEnabled}
            secondPoleDistance={1}
            onSecondPoleToggle={handleSecondPoleToggle}
            onThirdPoleToggle={handleThirdPoleToggle}
            onSecondPoleDistanceChange={(v) => post('setSecondPoleDistance', v)}
            primaryScale={primaryScale}
            secondaryScale={secondaryScale}
            tertiaryScale={tertiaryScale}
            onPrimaryScaleChange={handlePrimaryScale}
            onSecondaryScaleChange={handleSecondaryScale}
            onTertiaryScaleChange={handleTertiaryScale}
            primaryFlagPosition={primaryFlagPosition}
            secondaryFlagPosition={secondaryFlagPosition}
            tertiaryFlagPosition={tertiaryFlagPosition}
            raiseDuration={raiseDuration}
            onPrimaryFlagPositionChange={handlePrimaryFlagPosition}
            onSecondaryFlagPositionChange={handleSecondaryFlagPosition}
            onTertiaryFlagPositionChange={handleTertiaryFlagPosition}
            onRaiseDurationChange={handleRaiseDuration}
            backend={'WebGL'}
          />
        </div>
      </div>
    </div>
  )
}
