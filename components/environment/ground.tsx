'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

interface GroundProps {
  y: number
  /** Outer radius of the ground disc. */
  radius?: number
}

/**
 * Procedural concrete ground: a large disc with a CanvasTexture mixing
 * cool greys, fine aggregate speckle, faint hairline cracks and stains
 * so the surface reads as weathered cement rather than a flat fill.
 */
export function Ground({ y, radius = 60 }: GroundProps) {
  const texture = useMemo(() => makeConcreteTexture(1024), [])
  const normal = useMemo(() => makeConcreteNormal(512), [])

  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius, 96]} />
        <meshStandardMaterial
          map={texture}
          normalMap={normal}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          roughness={0.95}
          metalness={0.02}
        />
      </mesh>
    </group>
  )
}

// Helper: invoke draw at 8 wrapped neighbours so features that cross the
// edge tile seamlessly.
function wrapped(size: number, x: number, y: number, draw: (px: number, py: number) => void) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) draw(x + dx * size, y + dy * size)
  }
}

function makeConcreteTexture(size: number): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Mid-grey base
  ctx.fillStyle = '#8a8d90'
  ctx.fillRect(0, 0, size, size)

  // Low-frequency tone variation: large soft light/dark blotches
  const blotchColors = [
    'rgba(165,168,170,0.45)',
    'rgba(110,112,114,0.40)',
    'rgba(140,142,144,0.35)',
    'rgba(95,98,100,0.30)',
    'rgba(180,182,184,0.30)'
  ]
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 50 + Math.random() * 180
    const color = blotchColors[(Math.random() * blotchColors.length) | 0]
    wrapped(size, x, y, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r)
      g.addColorStop(0, color)
      g.addColorStop(1, color.replace(/,[^,]+\)$/, ',0)'))
      ctx.fillStyle = g
      ctx.fillRect(px - r, py - r, r * 2, r * 2)
    })
  }

  // Fine aggregate speckle
  const speckles = Math.floor(size * size * 0.05)
  for (let i = 0; i < speckles; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 0.4 + Math.random() * 1.1
    const shade = 70 + Math.random() * 130
    const a = 0.25 + Math.random() * 0.45
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${a})`
    wrapped(size, x, y, (px, py) => {
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // Occasional larger aggregate pebbles
  for (let i = 0; i < 350; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 1.2 + Math.random() * 2.4
    const shade = 60 + Math.random() * 150
    const warm = Math.random() < 0.3
    const col = warm
      ? `rgba(${shade + 15},${shade + 5},${shade - 10},0.55)`
      : `rgba(${shade},${shade + 2},${shade + 5},0.55)`
    ctx.fillStyle = col
    wrapped(size, x, y, (px, py) => {
      ctx.beginPath()
      ctx.ellipse(px, py, r, r * (0.6 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // Faint hairline cracks (multi-segment polylines, drawn wrapped)
  ctx.lineCap = 'round'
  for (let i = 0; i < 12; i++) {
    const x0 = Math.random() * size
    const y0 = Math.random() * size
    const segs = 6 + ((Math.random() * 8) | 0)
    const a0 = Math.random() * Math.PI * 2
    ctx.strokeStyle = `rgba(50,50,55,${0.25 + Math.random() * 0.25})`
    ctx.lineWidth = 0.6 + Math.random() * 0.6
    wrapped(size, 0, 0, (ox, oy) => {
      ctx.beginPath()
      ctx.moveTo(x0 + ox, y0 + oy)
      let cx = x0
      let cy = y0
      let ca = a0
      for (let s = 0; s < segs; s++) {
        ca += (Math.random() - 0.5) * 0.9
        const len = 8 + Math.random() * 18
        cx += Math.cos(ca) * len
        cy += Math.sin(ca) * len
        ctx.lineTo(cx + ox, cy + oy)
      }
      ctx.stroke()
    })
  }

  // Subtle dark stains
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 25 + Math.random() * 70
    wrapped(size, x, y, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r)
      g.addColorStop(0, 'rgba(40,40,45,0.22)')
      g.addColorStop(1, 'rgba(40,40,45,0)')
      ctx.fillStyle = g
      ctx.fillRect(px - r, py - r, r * 2, r * 2)
    })
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(8, 8)
  tex.anisotropy = 16
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeConcreteNormal(size: number): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Neutral up-pointing normal base
  ctx.fillStyle = 'rgb(128,128,255)'
  ctx.fillRect(0, 0, size, size)

  // Fine pitting: many tiny bumps with random tangent direction
  const bumps = Math.floor(size * size * 0.03)
  for (let i = 0; i < bumps; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const a = Math.random() * Math.PI * 2
    const strength = 0.2 + Math.random() * 0.35
    const r = Math.round(128 + Math.cos(a) * strength * 90)
    const g = Math.round(128 + Math.sin(a) * strength * 90)
    ctx.fillStyle = `rgb(${r},${g},220)`
    const radius = 0.6 + Math.random() * 1.2
    wrapped(size, x, y, (px, py) => {
      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(8, 8)
  tex.anisotropy = 8
  return tex
}
