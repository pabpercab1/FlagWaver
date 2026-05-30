'use client'

import { useRef } from 'react'
import * as THREE from 'three'

interface FlagpoleProps {
  height: number
  flagHeight: number
}

/**
 * Flagpole component - renders a realistic metal flagpole
 */
export function Flagpole({ height, flagHeight }: FlagpoleProps) {
  const groupRef = useRef<THREE.Group>(null)
  
  const poleRadius = 0.03
  const baseRadius = 0.15
  const baseHeight = 0.1
  const topRadius = 0.05

  // Position pole so flag attachment point is at origin
  const poleOffset = flagHeight / 2
  const shaftBottomY = -poleOffset + baseHeight
  const sphereCenterY = -poleOffset + height
  const shaftTopY = sphereCenterY - topRadius
  const shaftHeight = Math.max(0.2, shaftTopY - shaftBottomY)
  const shaftCenterY = (shaftBottomY + shaftTopY) / 2

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Main pole */}
      <mesh position={[0, shaftCenterY, 0]} castShadow>
        <cylinderGeometry args={[poleRadius, poleRadius * 1.1, shaftHeight, 16]} />
        <meshStandardMaterial 
          color="#8b9aa8"
          metalness={0.8}
          roughness={0.3}
        />
      </mesh>

      {/* Pole top ornament */}
      <mesh position={[0, sphereCenterY, 0]} castShadow>
        <sphereGeometry args={[topRadius, 16, 16]} />
        <meshStandardMaterial 
          color="#c0a030"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* Base */}
      <mesh position={[0, -poleOffset + baseHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[baseRadius * 0.8, baseRadius, baseHeight, 16]} />
        <meshStandardMaterial 
          color="#4a5568"
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Ground ring */}
      <mesh position={[0, -poleOffset + 0.01, 0]} receiveShadow>
        <cylinderGeometry args={[baseRadius * 1.2, baseRadius * 1.2, 0.02, 24]} />
        <meshStandardMaterial 
          color="#2d3748"
          metalness={0.5}
          roughness={0.5}
        />
      </mesh>
    </group>
  )
}
