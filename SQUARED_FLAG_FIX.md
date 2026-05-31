# Squared Flag Collision Bug - Analysis and Fix

## Problem Statement
When squared flags (where width = height) are loaded with collisions enabled, the cloth becomes:
- Visually bloated/inflated
- Stiff and unresponsive
- Deforms incorrectly compared to rectangular flags

**Key observation**: The severity is identical at 100% and 50% scale, indicating the issue is geometric rather than time-related.

## Root Cause: Anisotropic Particle Spacing

### The Grid Mismatch
The cloth uses **fixed segmentation: 70×47 segments** (segmentsX × segmentsY) regardless of flag dimensions.

**Default rectangular flag (3×2 m):**
- Particle spacing X: 3.0 ÷ 70 = **0.0429 m**
- Particle spacing Y: 2.0 ÷ 47 = **0.0426 m**
- Result: Nearly square particle grid ✓

**Squared flag (2×2 m):**
- Particle spacing X: 2.0 ÷ 70 = **0.0286 m** (30% tighter!)
- Particle spacing Y: 2.0 ÷ 47 = **0.0426 m**
- Result: **Anisotropic/rectangular particle grid** ✗

### The Collision Distance Problem
The default collision distance is hardcoded as `0.17` m, calibrated for the default flag's isotropic spacing:

```typescript
// Comment in code: "bumped above ~half the typical particle spacing"
selfCollisionDistance: 0.17,
```

For the default 3×2 flag: `0.17 ÷ 0.0426 ≈ **4× the minimum particle spacing**`

For a squared 2×2 flag: `0.17 ÷ 0.0286 ≈ **6× the minimum particle spacing**` ⚠️

### Why This Breaks Squared Flags
A collision distance 6× larger than particle spacing causes:
1. **Aggressive position corrections** in the X direction (tighter axis)
2. **Over-separation** of particles in X, creating artificial stiffness
3. **Asymmetric deformation**: X direction (stiff) vs Y direction (normal)
4. **Visual bloating**: The cloth tries to expand to compensate for over-constraint

### Why Scale Doesn't Fix It
With 50% scale (1×1 flag):
- Scaled X spacing: 0.0286 × 0.5 = 0.0143 m
- Scaled collision distance: 0.17 × 0.5 = 0.085 m (correctly scaled!)
- Ratio: 0.085 ÷ 0.0143 = **still 6×** ⚠️

The proportional mismatch persists at all scales → **same severity observed at 100% and 50%** ✓

## Solution: Adaptive Collision Distance

The fix makes the collision distance proportional to the **minimum particle spacing**, accounting for anisotropic grids.

### Implementation
Added to `ClothSimulation` class in `lib/cloth-simulation.ts`:

1. **New field**: `effectiveSelfCollisionDistance: number`

2. **New method**: `computeEffectiveCollisionDistance()`
   ```typescript
   private computeEffectiveCollisionDistance(): void {
     const { width, height, segmentsX, segmentsY } = this.params
     
     // Compute particle cell dimensions
     const cellX = width / segmentsX
     const cellY = height / segmentsY
     const minCellSize = Math.min(cellX, cellY)
     
     // Reference from default 3×2 flag
     const refCellX = 3.0 / 70
     const refCellY = 2.0 / 47
     const refMinCellSize = Math.min(refCellX, refCellY)
     
     // Scale proportionally
     const cellSizeRatio = minCellSize / refMinCellSize
     this.effectiveSelfCollisionDistance = 
       this.params.selfCollisionDistance * cellSizeRatio
   }
   ```

3. **Usage**: Changed `applySelfCollision()` to use `effectiveSelfCollisionDistance`

4. **Update points**: Method is called in:
   - Constructor (after `initConstraints()`)
   - `updateParams()` (when cloth dimensions change)
   - `reset()` (before re-initialization)

### Results

**Default 3×2 flag:**
- Min cell: 0.0426 m
- Scale factor: 1.0
- Effective collision: 0.17 m (unchanged) ✓

**Squared 2×2 flag:**
- Min cell: 0.0286 m
- Scale factor: 0.671
- Effective collision: 0.114 m (now proportional!) ✓

**Squared flag at 50% scale (1×1):**
- Min cell: 0.0143 m
- Scale factor: 0.336
- Effective collision: 0.057 m (maintains same ratio) ✓

## Testing Checklist

- [ ] Rectangular flags (3×2, 1×2, etc.) still work normally
- [ ] Squared flags (2×2, 1×1, etc.) now deform naturally with collisions
- [ ] Scaled flags maintain proportional behavior (no severity change with scale)
- [ ] Collision responsiveness is consistent across all aspect ratios
- [ ] Performance unchanged (same spatial hash, just different distance threshold)
- [ ] Floor and pole collisions still work correctly
- [ ] Wind simulation unaffected

## Physics Notes

The collision distance remains proportional to particle spacing regardless of:
- Cloth aspect ratio (squared, rectangular, etc.)
- Cloth scale (100%, 50%, 200%, etc.)
- Absolute dimensions (physics is scale-invariant when properly normalized)

This approach maintains the original design intent: collision distance scales with the cloth's internal geometry, not external parameters.
