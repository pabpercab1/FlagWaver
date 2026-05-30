'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { validateImageFile, processImage, ProcessedImage } from '@/lib/image-utils'

interface ImageUploadProps {
  label?: string
  currentImage: string | null
  onImageChange: (image: ProcessedImage | null) => void
  /** Optional per-flag size scale (0.5..1). When provided together with
   *  onScaleChange, renders a Size slider inside the pill. */
  scale?: number
  onScaleChange?: (scale: number) => void
}

/**
 * Image upload component with drag-and-drop support
 */
export function ImageUpload({ label = 'Flag Image', currentImage, onImageChange, scale, onScaleChange }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setIsProcessing(true)

    try {
      // Validate file
      const validation = validateImageFile(file)
      if (!validation.valid) {
        setError(validation.error || 'Invalid file')
        setIsProcessing(false)
        return
      }

      // Process and resize if needed
      const processed: ProcessedImage = await processImage(file)
      onImageChange(processed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image')
    } finally {
      setIsProcessing(false)
    }
  }, [onImageChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleClear = useCallback(() => {
    onImageChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onImageChange])

  const [customSizeInput, setCustomSizeInput] = useState('')

  const applyCustomSize = useCallback(() => {
    const parsed = parseFloat(customSizeInput)
    if (isNaN(parsed)) return
    const clamped = Math.max(10, Math.min(200, parsed))
    onScaleChange?.(clamped / 100)
    setCustomSizeInput('')
  }, [customSizeInput, onScaleChange])

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">{label}</label>
      
      {currentImage ? (
        <div className="w-full">
          <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/40">
            <div className="flex-shrink-0 w-20 h-12 rounded-md overflow-hidden border border-border bg-muted">
              <img src={currentImage} alt={`${label} preview`} className="w-full h-full object-cover" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{label}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">Image selected</p>
              {scale != null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">Size</div>
                  <div className="text-xs font-medium">{Math.round(scale * 100)}%</div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={triggerFilePicker}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Replace'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClear}
                disabled={isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={triggerFilePicker}
          className={`
            aspect-[3/2] rounded-lg border-2 border-dashed cursor-pointer
            flex flex-col items-center justify-center gap-2
            transition-colors duration-200
            ${isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
            }
            ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Processing...</span>
            </div>
          ) : (
            <>
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                {isDragging ? (
                  <Upload className="h-5 w-5 text-primary" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? 'Drop image here' : 'Click or drag to upload'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, or WEBP
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {scale != null && onScaleChange && (
        <div>
          <label className="text-xs text-muted-foreground">Size</label>
          <div className="mt-2">
            <div className="flex gap-2 flex-wrap">
              {[50, 65, 85, 100].map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant={Math.round(scale * 100) === opt ? 'default' : 'secondary'}
                  onClick={() => onScaleChange(opt / 100)}
                  className="px-3"
                >
                  {opt}%
                </Button>
              ))}
            </div>

            <div className="mt-2">
              <label className="text-xs text-muted-foreground">Custom size</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Custom %"
                  value={customSizeInput}
                  onChange={(e) => setCustomSizeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyCustomSize() }}
                  onBlur={applyCustomSize}
                  className="h-7 w-28 text-sm"
                  aria-label="Custom size percent"
                />
                <span className="text-xs text-muted-foreground">%</span>
                <p className="text-xs text-muted-foreground ml-2">(Enter % and press Enter)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onClick={(e) => {
          e.currentTarget.value = ''
        }}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  )
}
