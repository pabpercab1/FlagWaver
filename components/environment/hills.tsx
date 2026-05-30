'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

interface HillsProps {
  y: number
  /** Distance from origin where the hill ring sits. */
  radius?: number
}

/**
 * A ring of low rolling hills built from a single CylinderGeometry whose
 * top ring vertices are displaced by smooth noise. Cheap, no per-frame
 * work, and reads as distant terrain through the scene fog.
 */
export function Hills({ y, radius = 55 }: HillsProps) {
  const geometry = useMemo(() => buildHillsGeometry(radius), [radius])
  return (
    <mesh geometry={geometry} position={[0, y, 0]} receiveShadow>
      <meshStandardMaterial
        color="#6a8b55"
        roughness={1}
        metalness={0}
        flatShading
      />
    </mesh>
  )
}

function buildHillsGeometry(radius: number): THREE.BufferGeometry {
  const segments = 96
  const height = 6
  const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true)

  // Displace the TOP ring vertices radially + vertically to form bumps.
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const yv = pos.getY(i)
    if (yv > 0) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const a = Math.atan2(z, x)
      // Layered sines for organic ridge variation
      const n =
        Math.sin(a * 3.0) * 0.5 +
        Math.sin(a * 7.3 + 1.7) * 0.3 +
        Math.sin(a * 13.1 + 4.2) * 0.2
      const bump = 1.6 + n * 1.4 // total height ~0.2..3.0
      pos.setY(i, height / 2 + bump - 1)
      // Slight inward jitter so the silhouette isn't a perfect circle
      const inward = 1 - 0.04 * (0.5 + 0.5 * Math.sin(a * 5.0 + 0.4))
      pos.setX(i, x * inward)
      pos.setZ(i, z * inward)
    }
  }
  geo.computeVertexNormals()
  return geo
}
