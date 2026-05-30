/**
 * Client-side image processing utilities
 * Handles validation, resizing, and compression
 */

const MAX_IMAGE_SIZE = 2048 // Max dimension in pixels
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export interface ImageValidationResult {
  valid: boolean
  error?: string
  file?: File
}

export interface ProcessedImage {
  dataUrl: string
  width: number
  height: number
}

export interface ImageDimensions {
  width: number
  height: number
}

/**
 * Validate uploaded image file
 */
export function validateImageFile(file: File): ImageValidationResult {
  // Check file type
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type. Please use PNG, JPG, or WEBP.`
    }
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
    }
  }

  return { valid: true, file }
}

/**
 * Load and optionally resize an image file
 * Returns a data URL suitable for use as a texture
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        let { width, height } = img

        // Check if resizing is needed
        const needsResize = width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE

        if (needsResize) {
          // Calculate new dimensions maintaining aspect ratio
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_SIZE) / width)
            width = MAX_IMAGE_SIZE
          } else {
            width = Math.round((width * MAX_IMAGE_SIZE) / height)
            height = MAX_IMAGE_SIZE
          }

          // Create canvas for resizing
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          // Use high-quality image scaling
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)

          // Preserve alpha channel for PNG/WEBP; only JPEG sources lack it.
          const hasAlpha = file.type === 'image/png' || file.type === 'image/webp'
          const dataUrl = hasAlpha
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.85)
          resolve({ dataUrl, width, height })
        } else {
          // No resizing needed, use original
          resolve({
            dataUrl: e.target?.result as string,
            width,
            height
          })
        }
      }

      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }

      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Create a placeholder flag texture
 * Only call this on the client side
 */
export function createPlaceholderTexture(): string | null {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 341 // 3:2 aspect ratio

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, '#3b82f6')
    gradient.addColorStop(1, '#1d4ed8')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Add subtle grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    const gridSize = 32
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Add decorative elements
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.beginPath()
    ctx.arc(canvas.width * 0.7, canvas.height * 0.3, 80, 0, Math.PI * 2)
    ctx.fill()

    // Add text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Upload an image', canvas.width / 2, canvas.height / 2 - 20)
    
    ctx.font = '18px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fillText('PNG, JPG, or WEBP', canvas.width / 2, canvas.height / 2 + 20)

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Read image dimensions from a data URL
 */
export async function getImageDimensions(dataUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }

    img.onerror = () => {
      reject(new Error('Failed to load image dimensions'))
    }

    img.src = dataUrl
  })
}
