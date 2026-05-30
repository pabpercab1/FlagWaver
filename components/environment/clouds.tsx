'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

interface CloudsProps {
  y: number
}

/**
 * A handful of soft billboard clouds built from a CanvasTexture so we
 * don't pull in heavier volumetric cloud helpers. They face the camera
 * via sprite materials and sit high above the scene.
 */
export function Clouds({ y }: CloudsProps) {
  const texture = useMemo(() => makeCloudTexture(256), [])

  const clouds = useMemo(() => {
    const rng = mulberry32(1337)
    const list: { pos: [number, number, number]; scale: number }[] = []
    for (let i = 0; i < 14; i++) {
      const angle = rng() * Math.PI * 2
      const dist = 25 + rng() * 30
      const px = Math.cos(angle) * dist
      const pz = Math.sin(angle) * dist
      const py = y + (rng() - 0.5) * 4
      const scale = 6 + rng() * 8
      list.push({ pos: [px, py, pz], scale })
    }
    return list
  }, [y])

  return (
    <group>
      {clouds.map((c, i) => (
        <sprite key={i} position={c.pos} scale={[c.scale, c.scale * 0.5, 1]}>
          <spriteMaterial
            map={texture}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  )
}

function makeCloudTexture(size: number): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  // Build a puffy shape from many overlapping soft white circles
  const cx = size / 2
  const cy = size / 2
  const puffs = 22
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2
    const dx = Math.cos(a) * (size * 0.18) + (Math.random() - 0.5) * size * 0.1
    const dy = Math.sin(a) * (size * 0.08) + (Math.random() - 0.5) * size * 0.05
    const r = size * (0.16 + Math.random() * 0.12)
    const g = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, r)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
