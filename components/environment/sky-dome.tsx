'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * WebGPU-compatible sky: a large back-side sphere whose vertex colors
 * interpolate from a warm horizon band up through sky blue to a deeper
 * zenith, plus a soft sun sprite. Avoids raw ShaderMaterial (which the
 * three/webgpu NodeBuilder rejects).
 */
export function SkyDome({
  sunPosition = [8, 12, 6] as [number, number, number]
}: { sunPosition?: [number, number, number] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(500, 32, 16)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)

    const horizon = new THREE.Color('#e6d7b8') // warm pale
    const mid = new THREE.Color('#8ec5e8')     // sky blue
    const zenith = new THREE.Color('#3a7fb8')  // deeper blue

    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const t = THREE.MathUtils.clamp((y + 100) / 600, 0, 1) // 0 at bottom, ~1 at top
      if (t < 0.4) {
        const k = t / 0.4
        tmp.copy(horizon).lerp(mid, k)
      } else {
        const k = (t - 0.4) / 0.6
        tmp.copy(mid).lerp(zenith, k)
      }
      colors[i * 3 + 0] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  const sunTexture = useMemo(() => makeSunTexture(256), [])

  // Place the sun sprite far away in the sun direction
  const sunPos = useMemo<[number, number, number]>(() => {
    const v = new THREE.Vector3(...sunPosition).normalize().multiplyScalar(400)
    return [v.x, v.y, v.z]
  }, [sunPosition])

  return (
    <group>
      <mesh geometry={geometry} renderOrder={-1}>
        <meshBasicMaterial
          vertexColors
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <sprite position={sunPos} scale={[60, 60, 1]}>
        <spriteMaterial
          map={sunTexture}
          transparent
          depthWrite={false}
          depthTest={false}
          fog={false}
        />
      </sprite>
    </group>
  )
}

function makeSunTexture(size: number): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2)
  g.addColorStop(0, 'rgba(255,250,220,1)')
  g.addColorStop(0.15, 'rgba(255,240,190,0.95)')
  g.addColorStop(0.45, 'rgba(255,210,150,0.35)')
  g.addColorStop(1, 'rgba(255,200,140,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
