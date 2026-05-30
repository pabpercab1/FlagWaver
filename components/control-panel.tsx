'use client'

import { useCallback, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  Wind,
  Box,
  Settings2,
  Shield
} from 'lucide-react'
import { ImageUpload } from './image-upload'
import { SliderControl } from './slider-control'
import { ClothParams, CLOTH_PRESETS, ClothPreset, FlagPosition } from '@/lib/cloth-simulation'
import { ProcessedImage } from '@/lib/image-utils'

interface ControlPanelProps {
  params: ClothParams
  onParamsChange: (params: Partial<ClothParams>) => void
  isPaused: boolean
  onPauseToggle: () => void
  onReset: () => void
  currentImage: string | null
  onImageChange: (image: ProcessedImage | null) => void
  secondImage: string | null
  onSecondImageChange: (image: ProcessedImage | null) => void
  thirdImage: string | null
  onThirdImageChange: (image: ProcessedImage | null) => void
  selectedPreset: string | null
  onPresetSelect: (preset: ClothPreset) => void
  userPresets: ClothPreset[]
  onSavePreset: (name: string) => void
  onLoadPreset: (preset: ClothPreset) => void
  isSecondPoleEnabled: boolean
  isThirdPoleEnabled: boolean
  secondPoleDistance: number
  onSecondPoleToggle: () => void
  onThirdPoleToggle: () => void
  onSecondPoleDistanceChange: (distance: number) => void
  primaryScale: number
  secondaryScale: number
  tertiaryScale: number
  onPrimaryScaleChange: (scale: number) => void
  onSecondaryScaleChange: (scale: number) => void
  onTertiaryScaleChange: (scale: number) => void
  primaryFlagPosition: FlagPosition
  secondaryFlagPosition: FlagPosition
  tertiaryFlagPosition: FlagPosition
  raiseDuration: number
  onPrimaryFlagPositionChange: (position: FlagPosition) => void
  onSecondaryFlagPositionChange: (position: FlagPosition) => void
  onTertiaryFlagPositionChange: (position: FlagPosition) => void
  onRaiseDurationChange: (duration: number) => void
  backend: 'WebGPU' | 'WebGL'
}

function BackendGlyph() {
  const id = useId().replace(/:/g, '')
  const paint0Id = `backend_paint0_${id}`
  const paint1Id = `backend_paint1_${id}`
  const maskId = `backend_mask_${id}`

  return (
    <svg width="16" height="16" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <g transform="translate(8.5, 13)">
        <path
          d="M13.3 15.2 L2.34 1 V12.6"
          fill="none"
          stroke={`url(#${paint0Id})`}
          strokeWidth="1.86"
          mask={`url(#${maskId})`}
        />
        <path d="M11.825 1.5 V13.1" strokeWidth="1.86" stroke={`url(#${paint1Id})`} />
      </g>
      <defs>
        <linearGradient id={paint0Id} x1="9.95555" y1="11.1226" x2="15.4778" y2="17.9671" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" />
          <stop offset="0.604072" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={paint1Id} x1="11.8222" y1="1.40039" x2="11.791" y2="9.62542" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <rect width="5" height="1.5" fill="black" />
        </mask>
      </defs>
    </svg>
  )
}

/**
 * Control panel with all simulation parameters
 */
export function ControlPanel({
  params,
  onParamsChange,
  isPaused,
  onPauseToggle,
  onReset,
  currentImage,
  onImageChange,
  secondImage,
  onSecondImageChange,
  thirdImage,
  onThirdImageChange,
  selectedPreset,
  onPresetSelect,
  userPresets,
  onSavePreset,
  isSecondPoleEnabled,
  isThirdPoleEnabled,
  secondPoleDistance,
  onSecondPoleToggle,
  onThirdPoleToggle,
  onSecondPoleDistanceChange,
  primaryScale,
  secondaryScale,
  tertiaryScale,
  onPrimaryScaleChange,
  onSecondaryScaleChange,
  onTertiaryScaleChange,
  primaryFlagPosition,
  secondaryFlagPosition,
  tertiaryFlagPosition,
  raiseDuration,
  onPrimaryFlagPositionChange,
  onSecondaryFlagPositionChange,
  onTertiaryFlagPositionChange,
  onRaiseDurationChange,
  backend
}: ControlPanelProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  const handlePresetChange = useCallback((value: string) => {
    const allPresets = [...CLOTH_PRESETS, ...userPresets]
    const preset = allPresets.find(p => p.name === value)
    if (preset) {
      onPresetSelect(preset)
    }
  }, [userPresets, onPresetSelect])

  const handleSavePreset = useCallback(() => {
    if (newPresetName.trim()) {
      onSavePreset(newPresetName.trim())
      setNewPresetName('')
      setSaveDialogOpen(false)
    }
  }, [newPresetName, onSavePreset])

  const flagPositionOptions: { value: FlagPosition; label: string }[] = [
    { value: 'raised', label: 'Raised' },
    { value: 'half-mast', label: 'Half-Mast' },
    { value: 'lowered', label: 'Lowered' }
  ]

  return (
    <div className="h-full min-h-0 flex flex-col bg-card border-l border-border">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Controls</h2>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-muted/50 text-muted-foreground">
          <BackendGlyph />
          <span className="text-[11px] font-semibold tracking-wide">{backend}</span>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-6">
          <div className="flex gap-2">
            <Button
              variant={isPaused ? 'default' : 'secondary'}
              size="sm"
              onClick={onPauseToggle}
              className="flex-1"
            >
              {isPaused ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="flex-1"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Label className="text-sm font-medium">Flag Position</Label>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Flag 1</Label>
              <div className="grid grid-cols-3 gap-2">
                {flagPositionOptions.map(option => (
                  <Button
                    key={`flag1-${option.value}`}
                    variant={primaryFlagPosition === option.value ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => onPrimaryFlagPositionChange(option.value)}
                    className="px-2"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            {isSecondPoleEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Flag 2</Label>
                <div className="grid grid-cols-3 gap-2">
                  {flagPositionOptions.map(option => (
                    <Button
                      key={`flag2-${option.value}`}
                      variant={secondaryFlagPosition === option.value ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => onSecondaryFlagPositionChange(option.value)}
                      className="px-2"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {isSecondPoleEnabled && isThirdPoleEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Flag 3</Label>
                <div className="grid grid-cols-3 gap-2">
                  {flagPositionOptions.map(option => (
                    <Button
                      key={`flag3-${option.value}`}
                      variant={tertiaryFlagPosition === option.value ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => onTertiaryFlagPositionChange(option.value)}
                      className="px-2"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <SliderControl
              label="Animation Duration"
              value={raiseDuration}
              min={0.5}
              max={30}
              step={0.5}
              unit="s"
              onChange={onRaiseDurationChange}
            />
          </div>

          <Separator />

          <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <Label htmlFor="second-pole-toggle" className="text-sm font-medium">Enable Second Flagpole</Label>
              <Switch
                id="second-pole-toggle"
                checked={isSecondPoleEnabled}
                onCheckedChange={onSecondPoleToggle}
              />
            </div>
            {isSecondPoleEnabled && (
              <SliderControl
                label="Second Pole Distance"
                value={secondPoleDistance}
                min={0.5}
                max={8}
                step={0.1}
                unit="m"
                onChange={onSecondPoleDistanceChange}
              />
            )}
            {isSecondPoleEnabled && (
              <div className="flex items-center justify-between">
                <Label htmlFor="third-pole-toggle" className="text-sm font-medium">Enable Third Flagpole</Label>
                <Switch
                  id="third-pole-toggle"
                  checked={isThirdPoleEnabled}
                  onCheckedChange={onThirdPoleToggle}
                />
              </div>
            )}
            {isSecondPoleEnabled && isThirdPoleEnabled && (
              <p className="text-xs text-muted-foreground">
                Third pole uses the same spacing as the second pole.
              </p>
            )}
          </div>

          <Separator />

          <ImageUpload
            label="Flag 1 Image"
            currentImage={currentImage}
            onImageChange={onImageChange}
            scale={primaryScale}
            onScaleChange={onPrimaryScaleChange}
          />

          {isSecondPoleEnabled && (
            <ImageUpload
              label="Flag 2 Image"
              currentImage={secondImage}
              onImageChange={onSecondImageChange}
              scale={secondaryScale}
              onScaleChange={onSecondaryScaleChange}
            />
          )}

          {isSecondPoleEnabled && isThirdPoleEnabled && (
            <ImageUpload
              label="Flag 3 Image"
              currentImage={thirdImage}
              onImageChange={onThirdImageChange}
              scale={tertiaryScale}
              onScaleChange={onTertiaryScaleChange}
            />
          )}

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Material Preset</Label>
            <div className="flex gap-2">
              <Select value={selectedPreset || ''} onValueChange={handlePresetChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a preset" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs text-muted-foreground">Built-in</div>
                  {CLOTH_PRESETS.map(preset => (
                    <SelectItem key={preset.name} value={preset.name}>
                      {preset.name}
                    </SelectItem>
                  ))}
                  {userPresets.length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <div className="px-2 py-1 text-xs text-muted-foreground">Custom</div>
                      {userPresets.map(preset => (
                        <SelectItem key={preset.name} value={preset.name}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>

              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Save className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Preset</DialogTitle>
                    <DialogDescription>
                      Save your current settings as a custom preset.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="preset-name">Preset Name</Label>
                    <Input
                      id="preset-name"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="My Custom Preset"
                      className="mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSavePreset} disabled={!newPresetName.trim()}>
                      Save Preset
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="wind" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="wind" className="text-xs">
                <Wind className="h-3 w-3 mr-1" />
                Wind
              </TabsTrigger>
              <TabsTrigger value="physics" className="text-xs">
                <Settings2 className="h-3 w-3 mr-1" />
                Physics
              </TabsTrigger>
              <TabsTrigger value="cloth" className="text-xs">
                <Box className="h-3 w-3 mr-1" />
                Cloth
              </TabsTrigger>
              <TabsTrigger value="collision" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                Collision
              </TabsTrigger>
            </TabsList>

            <TabsContent value="wind" className="space-y-4 mt-4">
              <SliderControl
                label="Wind Speed"
                value={params.windSpeed}
                min={0}
                max={20}
                step={0.1}
                unit="m/s"
                onChange={(v) => onParamsChange({ windSpeed: v })}
              />
              <SliderControl
                label="Wind Direction"
                value={(params.windDirection * 180) / Math.PI}
                min={-180}
                max={180}
                step={1}
                unit="deg"
                onChange={(v) => onParamsChange({ windDirection: (v * Math.PI) / 180 })}
              />
              <SliderControl
                label="Gust Amount"
                value={params.gustAmount}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onParamsChange({ gustAmount: v })}
              />
            </TabsContent>

            <TabsContent value="physics" className="space-y-4 mt-4">
              <SliderControl
                label="Gravity"
                value={params.gravity}
                min={0}
                max={20}
                step={0.1}
                unit="m/s2"
                onChange={(v) => onParamsChange({ gravity: v })}
              />
              <SliderControl
                label="Stretch Stiffness"
                value={params.stretchStiffness}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onParamsChange({ stretchStiffness: v })}
              />
              <SliderControl
                label="Bend Stiffness"
                value={params.bendStiffness}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onParamsChange({ bendStiffness: v })}
              />
              <SliderControl
                label="Damping"
                value={params.damping}
                min={0}
                max={0.2}
                step={0.001}
                onChange={(v) => onParamsChange({ damping: v })}
              />
              <SliderControl
                label="Drag"
                value={params.drag}
                min={0}
                max={0.5}
                step={0.01}
                onChange={(v) => onParamsChange({ drag: v })}
              />
            </TabsContent>

            <TabsContent value="cloth" className="space-y-4 mt-4">
              <SliderControl
                label="Mass"
                value={params.mass}
                min={0.01}
                max={1}
                step={0.01}
                unit="kg"
                onChange={(v) => onParamsChange({ mass: v })}
              />
              <SliderControl
                label="Width"
                value={params.width}
                min={1}
                max={5}
                step={0.1}
                unit="m"
                onChange={(v) => onParamsChange({ width: v })}
              />
              <SliderControl
                label="Height"
                value={params.height}
                min={0.5}
                max={4}
                step={0.1}
                unit="m"
                onChange={(v) => onParamsChange({ height: v })}
              />
              <SliderControl
                label="Quality (Segments)"
                value={params.segmentsX}
                min={10}
                max={100}
                step={1}
                onChange={(v) => onParamsChange({
                  segmentsX: v,
                  segmentsY: Math.round(v * (params.height / params.width))
                })}
              />
            </TabsContent>

            <TabsContent value="collision" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="collision-toggle" className="text-sm">Enable Collisions</Label>
                <Switch
                  id="collision-toggle"
                  checked={params.collisionsEnabled}
                  onCheckedChange={(checked) => onParamsChange({ collisionsEnabled: checked })}
                />
              </div>

              {params.collisionsEnabled && (
                <>
                  <SliderControl
                    label="Floor Height (0m = Pole Base)"
                    value={params.floorY}
                    min={-3}
                    max={2}
                    step={0.1}
                    unit="m"
                    onChange={(v) => onParamsChange({ floorY: v })}
                  />
                  <SliderControl
                    label="Pole Radius"
                    value={params.poleRadius}
                    min={0.02}
                    max={0.2}
                    step={0.01}
                    unit="m"
                    onChange={(v) => onParamsChange({ poleRadius: v })}
                  />
                  <SliderControl
                    label="Self-Collision Distance"
                    value={params.selfCollisionDistance}
                    min={0.02}
                    max={0.2}
                    step={0.01}
                    unit="m"
                    onChange={(v) => onParamsChange({ selfCollisionDistance: v })}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Collisions include: floor, each flagpole cylinder, and cloth self-collision.
                    Note: Self-collision can be computationally expensive.
                  </p>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Position-Based Dynamics Cloth Simulation
        </p>
      </div>
    </div>
  )
}
