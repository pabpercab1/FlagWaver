'use client'

import { useState, useCallback, useEffect } from 'react'
import { ClothParams, DEFAULT_PARAMS, ClothPreset, CLOTH_PRESETS, FlagPosition, FlagPositionCommand } from '@/lib/cloth-simulation'
import {
  saveSettings,
  loadSettings,
  saveImage,
  loadImage,
  clearImage,
  saveUserPresets,
  loadUserPresets
} from '@/lib/storage'
import { createPlaceholderTexture, getImageDimensions, ProcessedImage } from '@/lib/image-utils'

/**
 * Custom hook to manage all flag simulation state
 * Handles persistence to localStorage
 */
export function useFlagSimulation() {
  const [params, setParams] = useState<ClothParams>(DEFAULT_PARAMS)
  const [textureUrl, setTextureUrl] = useState<string | null>(null)
  const [secondTextureUrl, setSecondTextureUrl] = useState<string | null>(null)
  const [thirdTextureUrl, setThirdTextureUrl] = useState<string | null>(null)
  // Independent aspect ratio for the secondary flag (width / height).
  // null means "fall back to the primary flag's width" so behaviour is
  // unchanged when no secondary image has been picked.
  const [secondaryAspect, setSecondaryAspect] = useState<number | null>(null)
  const [tertiaryAspect, setTertiaryAspect] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<string | null>('Polyester')
  const [userPresets, setUserPresets] = useState<ClothPreset[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSecondPoleEnabled, setIsSecondPoleEnabled] = useState(false)
  const [isThirdPoleEnabled, setIsThirdPoleEnabled] = useState(false)
  const [secondPoleDistance, setSecondPoleDistance] = useState(2)
  // Per-flag size scale (0.5..1). Reduces width and height while keeping
  // the cloth's top edge at the same world Y as the full-size flag.
  const [primaryScale, setPrimaryScale] = useState(1)
  const [secondaryScale, setSecondaryScale] = useState(1)
  const [tertiaryScale, setTertiaryScale] = useState(1)
  
  // Flag raising state
  const [primaryFlagPosition, setPrimaryFlagPosition] = useState<FlagPosition>('raised')
  const [secondaryFlagPosition, setSecondaryFlagPosition] = useState<FlagPosition>('raised')
  const [tertiaryFlagPosition, setTertiaryFlagPosition] = useState<FlagPosition>('raised')
  const [raiseDuration, setRaiseDuration] = useState(3) // seconds
  const [primaryRaiseCommand, setPrimaryRaiseCommand] = useState<FlagPositionCommand | null>(null)
  const [secondaryRaiseCommand, setSecondaryRaiseCommand] = useState<FlagPositionCommand | null>(null)
  const [tertiaryRaiseCommand, setTertiaryRaiseCommand] = useState<FlagPositionCommand | null>(null)

  const applyImageAspectRatio = useCallback((width: number, height: number) => {
    if (height <= 0) return

    const aspectRatio = width / height
    const clampedAspect = Math.min(3, Math.max(0.5, aspectRatio))

    setParams(prev => ({
      ...prev,
      width: Number((prev.height * clampedAspect).toFixed(3))
    }))
  }, [])

  // Compute a clamped aspect for the secondary flag without touching shared
  // params. Stored separately so it survives height changes.
  const recordSecondaryAspect = useCallback((width: number, height: number) => {
    if (height <= 0) return
    const aspect = width / height
    setSecondaryAspect(Math.min(3, Math.max(0.5, aspect)))
  }, [])

  const recordTertiaryAspect = useCallback((width: number, height: number) => {
    if (height <= 0) return
    const aspect = width / height
    setTertiaryAspect(Math.min(3, Math.max(0.5, aspect)))
  }, [])

  // Load saved state on mount
  useEffect(() => {
    // Load settings
    const savedSettings = loadSettings()
    if (savedSettings) {
      setParams(savedSettings.params)
      setSelectedPreset(savedSettings.presetName)
      setIsSecondPoleEnabled(savedSettings.secondPoleEnabled ?? false)
      setIsThirdPoleEnabled(savedSettings.thirdPoleEnabled ?? false)
      setSecondPoleDistance(savedSettings.secondPoleDistance ?? 2)
      setPrimaryScale(savedSettings.primaryScale ?? 1)
      setSecondaryScale(savedSettings.secondaryScale ?? 1)
      setTertiaryScale(savedSettings.tertiaryScale ?? 1)
    } else {
      // Apply default preset
      const defaultPreset = CLOTH_PRESETS.find(p => p.name === 'Polyester')
      if (defaultPreset) {
        setParams(prev => ({ ...prev, ...defaultPreset.params }))
      }
    }

    // Load saved image
    const savedImage = loadImage()
    if (savedImage) {
      setTextureUrl(savedImage)
      getImageDimensions(savedImage)
        .then(({ width, height }) => applyImageAspectRatio(width, height))
        .catch(() => {
          // Keep current ratio if dimensions cannot be read.
        })
    } else {
      // Create placeholder texture (only on client)
      const placeholder = createPlaceholderTexture()
      if (placeholder) {
        setTextureUrl(placeholder)
        applyImageAspectRatio(3, 2)
      }
    }

    // Load optional secondary flag image
    const savedSecondImage = loadImage('secondary')
    if (savedSecondImage) {
      setSecondTextureUrl(savedSecondImage)
      getImageDimensions(savedSecondImage)
        .then(({ width, height }) => recordSecondaryAspect(width, height))
        .catch(() => {
          // Keep null aspect (falls back to primary width) if unreadable.
        })
    }

    // Load optional tertiary flag image
    const savedThirdImage = loadImage('tertiary')
    if (savedThirdImage) {
      setThirdTextureUrl(savedThirdImage)
      getImageDimensions(savedThirdImage)
        .then(({ width, height }) => recordTertiaryAspect(width, height))
        .catch(() => {
          // Keep null aspect (falls back to primary width) if unreadable.
        })
    }

    // Load user presets
    const savedUserPresets = loadUserPresets()
    if (savedUserPresets.length > 0) {
      setUserPresets(savedUserPresets)
    }

    setIsInitialized(true)
  }, [applyImageAspectRatio, recordSecondaryAspect, recordTertiaryAspect])

  // Save settings when params or preset changes
  useEffect(() => {
    if (isInitialized) {
      saveSettings(params, selectedPreset, {
        secondPoleEnabled: isSecondPoleEnabled,
        secondPoleDistance,
        primaryScale,
        secondaryScale,
        thirdPoleEnabled: isThirdPoleEnabled,
        tertiaryScale
      })
    }
  }, [params, selectedPreset, isSecondPoleEnabled, secondPoleDistance, primaryScale, secondaryScale, isThirdPoleEnabled, tertiaryScale, isInitialized])

  // Update params
  const updateParams = useCallback((newParams: Partial<ClothParams>) => {
    setParams(prev => ({ ...prev, ...newParams }))
    // Clear preset selection when manually changing params
    setSelectedPreset(null)
  }, [])

  // Handle image change
  const handleImageChange = useCallback((image: ProcessedImage | null) => {
    if (image) {
      setTextureUrl(image.dataUrl)
      applyImageAspectRatio(image.width, image.height)
      const saved = saveImage(image.dataUrl)
      if (!saved) {
        console.warn('Image too large to save to localStorage')
      }
    } else {
      clearImage()
      const placeholder = createPlaceholderTexture()
      setTextureUrl(placeholder)
      applyImageAspectRatio(3, 2)
    }
  }, [applyImageAspectRatio])

  // Handle secondary image change. The secondary flag tracks its own aspect
  // ratio so its width is independent of the primary flag.
  const handleSecondImageChange = useCallback((image: ProcessedImage | null) => {
    if (image) {
      setSecondTextureUrl(image.dataUrl)
      recordSecondaryAspect(image.width, image.height)
      const saved = saveImage(image.dataUrl, 'secondary')
      if (!saved) {
        console.warn('Image too large to save to localStorage')
      }
    } else {
      clearImage('secondary')
      setSecondTextureUrl(null)
      setSecondaryAspect(null)
    }
  }, [recordSecondaryAspect])

  // Handle tertiary image change.
  const handleThirdImageChange = useCallback((image: ProcessedImage | null) => {
    if (image) {
      setThirdTextureUrl(image.dataUrl)
      recordTertiaryAspect(image.width, image.height)
      const saved = saveImage(image.dataUrl, 'tertiary')
      if (!saved) {
        console.warn('Image too large to save to localStorage')
      }
    } else {
      clearImage('tertiary')
      setThirdTextureUrl(null)
      setTertiaryAspect(null)
    }
  }, [recordTertiaryAspect])

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  // Reset simulation
  const reset = useCallback(() => {
    setResetTrigger(prev => prev + 1)
    setPrimaryFlagPosition('raised')
    setSecondaryFlagPosition('raised')
    setTertiaryFlagPosition('raised')
  }, [])

  // Select preset
  const selectPreset = useCallback((preset: ClothPreset) => {
    setParams(prev => ({ ...prev, ...preset.params }))
    setSelectedPreset(preset.name)
    // Reset simulation when changing preset
    setResetTrigger(prev => prev + 1)
  }, [])

  // Save user preset
  const savePreset = useCallback((name: string) => {
    const newPreset: ClothPreset = {
      name,
      params: {
        mass: params.mass,
        stretchStiffness: params.stretchStiffness,
        bendStiffness: params.bendStiffness,
        damping: params.damping,
        drag: params.drag
      }
    }
    
    // Check if preset with same name exists
    const existingIndex = userPresets.findIndex(p => p.name === name)
    let updatedPresets: ClothPreset[]
    
    if (existingIndex >= 0) {
      // Update existing preset
      updatedPresets = [...userPresets]
      updatedPresets[existingIndex] = newPreset
    } else {
      // Add new preset
      updatedPresets = [...userPresets, newPreset]
    }
    
    setUserPresets(updatedPresets)
    setSelectedPreset(name)
    saveUserPresets(updatedPresets)
  }, [params, userPresets])

  // Load user preset
  const loadPreset = useCallback((preset: ClothPreset) => {
    selectPreset(preset)
  }, [selectPreset])

  const setPrimaryFlagPositionAndRaise = useCallback((position: FlagPosition) => {
    setPrimaryFlagPosition(position)
    setPrimaryRaiseCommand({ position, duration: raiseDuration, trigger: Date.now() })
  }, [raiseDuration])

  const setSecondaryFlagPositionAndRaise = useCallback((position: FlagPosition) => {
    setSecondaryFlagPosition(position)
    setSecondaryRaiseCommand({ position, duration: raiseDuration, trigger: Date.now() })
  }, [raiseDuration])

  const setTertiaryFlagPositionAndRaise = useCallback((position: FlagPosition) => {
    setTertiaryFlagPosition(position)
    setTertiaryRaiseCommand({ position, duration: raiseDuration, trigger: Date.now() })
  }, [raiseDuration])

  const toggleSecondPoleEnabled = useCallback(() => {
    setIsSecondPoleEnabled(prev => !prev)
  }, [])

  const toggleThirdPoleEnabled = useCallback(() => {
    setIsThirdPoleEnabled(prev => !prev)
  }, [])

  const updateSecondPoleDistance = useCallback((distance: number) => {
    setSecondPoleDistance(distance)
  }, [])

  const updatePrimaryScale = useCallback((scale: number) => {
    setPrimaryScale(Math.min(1, Math.max(0.5, scale)))
  }, [])

  const updateSecondaryScale = useCallback((scale: number) => {
    setSecondaryScale(Math.min(1, Math.max(0.5, scale)))
  }, [])

  const updateTertiaryScale = useCallback((scale: number) => {
    setTertiaryScale(Math.min(1, Math.max(0.5, scale)))
  }, [])

  // Update raise duration
  const updateRaiseDuration = useCallback((duration: number) => {
    setRaiseDuration(duration)
  }, [])

  // Per-flag width override for the secondary flag (height * its own aspect),
  // or null when no secondary image has been chosen.
  const secondaryWidth = secondaryAspect != null
    ? Number((params.height * secondaryAspect).toFixed(3))
    : null

  const tertiaryWidth = tertiaryAspect != null
    ? Number((params.height * tertiaryAspect).toFixed(3))
    : null

  return {
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
    setPrimaryFlagPosition: setPrimaryFlagPositionAndRaise,
    setSecondaryFlagPosition: setSecondaryFlagPositionAndRaise,
    setTertiaryFlagPosition: setTertiaryFlagPositionAndRaise,
    toggleSecondPoleEnabled,
    toggleThirdPoleEnabled,
    updateSecondPoleDistance,
    updatePrimaryScale,
    updateSecondaryScale,
    updateTertiaryScale,
    updateRaiseDuration
  }
}
