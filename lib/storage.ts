import { ClothParams, DEFAULT_PARAMS, ClothPreset } from './cloth-simulation'

const STORAGE_KEYS = {
  SETTINGS: 'flag-sim-settings',
  IMAGE: 'flag-sim-image',
  IMAGE_SECONDARY: 'flag-sim-image-secondary',
  IMAGE_TERTIARY: 'flag-sim-image-tertiary',
  PRESET: 'flag-sim-preset',
  USER_PRESETS: 'flag-sim-user-presets'
}

export interface StoredSettings {
  params: ClothParams
  presetName: string | null
  secondPoleEnabled?: boolean
  secondPoleDistance?: number
  primaryScale?: number
  secondaryScale?: number
  thirdPoleEnabled?: boolean
  tertiaryScale?: number
}

export interface LayoutSettings {
  secondPoleEnabled: boolean
  secondPoleDistance: number
  primaryScale: number
  secondaryScale: number
  thirdPoleEnabled: boolean
  tertiaryScale: number
}

/**
 * Save current simulation settings to localStorage
 */
export function saveSettings(
  params: ClothParams,
  presetName: string | null,
  layoutSettings?: Partial<LayoutSettings>
): void {
  try {
    const data: StoredSettings = {
      params,
      presetName,
      secondPoleEnabled: layoutSettings?.secondPoleEnabled,
      secondPoleDistance: layoutSettings?.secondPoleDistance,
      primaryScale: layoutSettings?.primaryScale,
      secondaryScale: layoutSettings?.secondaryScale,
      thirdPoleEnabled: layoutSettings?.thirdPoleEnabled,
      tertiaryScale: layoutSettings?.tertiaryScale
    }
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to save settings:', error)
  }
}

/**
 * Load simulation settings from localStorage
 */
export function loadSettings(): StoredSettings | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    if (data) {
      const parsed = JSON.parse(data)
      // Merge with defaults to handle missing fields from older versions
      return {
        params: { ...DEFAULT_PARAMS, ...parsed.params },
        presetName: parsed.presetName,
        secondPoleEnabled: parsed.secondPoleEnabled,
        secondPoleDistance: parsed.secondPoleDistance,
        primaryScale: parsed.primaryScale,
        secondaryScale: parsed.secondaryScale,
        thirdPoleEnabled: parsed.thirdPoleEnabled,
        tertiaryScale: parsed.tertiaryScale
      }
    }
  } catch (error) {
    console.warn('Failed to load settings:', error)
  }
  return null
}

/**
 * Save flag image as base64 to localStorage
 * Note: Large images may exceed localStorage limits (~5MB)
 */
export function saveImage(dataUrl: string, slot: 'primary' | 'secondary' | 'tertiary' = 'primary'): boolean {
  try {
    // Check approximate size (base64 is ~33% larger than binary)
    if (dataUrl.length > 4 * 1024 * 1024) { // ~4MB limit
      console.warn('Image too large for localStorage')
      return false
    }
    const key = slot === 'tertiary'
      ? STORAGE_KEYS.IMAGE_TERTIARY
      : slot === 'secondary' ? STORAGE_KEYS.IMAGE_SECONDARY : STORAGE_KEYS.IMAGE
    localStorage.setItem(key, dataUrl)
    return true
  } catch (error) {
    console.warn('Failed to save image:', error)
    return false
  }
}

/**
 * Load flag image from localStorage
 */
export function loadImage(slot: 'primary' | 'secondary' | 'tertiary' = 'primary'): string | null {
  try {
    const key = slot === 'tertiary'
      ? STORAGE_KEYS.IMAGE_TERTIARY
      : slot === 'secondary' ? STORAGE_KEYS.IMAGE_SECONDARY : STORAGE_KEYS.IMAGE
    return localStorage.getItem(key)
  } catch (error) {
    console.warn('Failed to load image:', error)
    return null
  }
}

/**
 * Clear saved image from localStorage
 */
export function clearImage(slot: 'primary' | 'secondary' | 'tertiary' = 'primary'): void {
  try {
    const key = slot === 'tertiary'
      ? STORAGE_KEYS.IMAGE_TERTIARY
      : slot === 'secondary' ? STORAGE_KEYS.IMAGE_SECONDARY : STORAGE_KEYS.IMAGE
    localStorage.removeItem(key)
  } catch (error) {
    console.warn('Failed to clear image:', error)
  }
}

/**
 * Save user-created presets
 */
export function saveUserPresets(presets: ClothPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PRESETS, JSON.stringify(presets))
  } catch (error) {
    console.warn('Failed to save user presets:', error)
  }
}

/**
 * Load user-created presets
 */
export function loadUserPresets(): ClothPreset[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PRESETS)
    if (data) {
      return JSON.parse(data)
    }
  } catch (error) {
    console.warn('Failed to load user presets:', error)
  }
  return []
}

/**
 * Clear all stored data
 */
export function clearAllStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SETTINGS)
    localStorage.removeItem(STORAGE_KEYS.IMAGE)
    localStorage.removeItem(STORAGE_KEYS.IMAGE_SECONDARY)
    localStorage.removeItem(STORAGE_KEYS.IMAGE_TERTIARY)
    localStorage.removeItem(STORAGE_KEYS.PRESET)
    localStorage.removeItem(STORAGE_KEYS.USER_PRESETS)
  } catch (error) {
    console.warn('Failed to clear storage:', error)
  }
}
