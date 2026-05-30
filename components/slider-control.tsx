'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { useState, useCallback, useEffect } from 'react'

interface SliderControlProps {
  label: string
  value?: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}

/**
 * Slider control with label and optional unit display
 * Shows both slider and numeric input for precise control
 */
export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange
}: SliderControlProps) {
  const safeValue = typeof value === 'number' ? value : min
  const [inputValue, setInputValue] = useState(String(safeValue))

  // Sync input when external value changes
  useEffect(() => {
    const v = typeof value === 'number' ? value : min
    setInputValue(v.toFixed(step < 1 ? 2 : 0))
  }, [value, step, min])

  const handleSliderChange = useCallback((values: number[]) => {
    const newValue = values[0]
    onChange(newValue)
  }, [onChange])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])

  const handleInputBlur = useCallback(() => {
    let newValue = parseFloat(inputValue)
    if (isNaN(newValue)) {
      newValue = typeof value === 'number' ? value : min
    }
    // Clamp to valid range
    newValue = Math.max(min, Math.min(max, newValue))
    onChange(newValue)
    setInputValue(newValue.toFixed(step < 1 ? 2 : 0))
  }, [inputValue, min, max, step, value, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur()
    }
  }, [handleInputBlur])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="h-7 w-16 text-right text-sm px-2"
          />
          {unit && <span className="text-xs text-muted-foreground w-8">{unit}</span>}
        </div>
      </div>
      <Slider
        value={[safeValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleSliderChange}
        className="w-full"
      />
    </div>
  )
}
