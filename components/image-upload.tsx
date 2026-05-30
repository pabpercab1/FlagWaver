'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SliderControl } from './slider-control'
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

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">{label}</label>
      
      {currentImage ? (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 rounded-full border border-border bg-muted/40 px-2 py-2">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden border border-border bg-muted">
                <img
                  src={currentImage}
                  alt={`${label} preview`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{label}</p>
                <p className="text-[11px] text-muted-foreground truncate">Image selected</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="px-3"
              onClick={triggerFilePicker}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Replace'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="px-3"
              onClick={handleClear}
              disabled={isProcessing}
            >
              <X className="h-4 w-4 mr-1" />
              Delete
            </Button>
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
        <SliderControl
          label="Size"
          value={Math.round(scale * 100)}
          min={50}
          max={100}
          step={1}
          unit="%"
          onChange={(v) => onScaleChange(v / 100)}
        />
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
