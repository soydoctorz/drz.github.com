'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { generateParticleTracks, ParticleTrack } from '@/utils/particleGenerator'
import { PROJECTILE_CONFIGS, getDefaultProjectileConfig } from '@/utils/projectileConfigs'
import styles from './BubbleChamber.module.css'

// Constants for optimization
const LABEL_THRESHOLD = 30
const NOISE_DENSITY = 0.0005
const GRID_SIZE = 50
const TRACK_HOVER_THRESHOLD = 0.05
const PAN_STEP = 20
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_FACTOR = 1.1

interface LabelPosition {
  track: ParticleTrack
  x: number
  y: number
  symbol: string
}

interface BubbleChamberProps {
  projectileId?: string
}

export default function BubbleChamber({ projectileId }: BubbleChamberProps = { projectileId: undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const defaultProjectile = getDefaultProjectileConfig()
  const [selectedProjectile, setSelectedProjectile] = useState<string>(
    projectileId || defaultProjectile.id
  )
  const [tracks, setTracks] = useState<ParticleTrack[]>([])
  const [hoveredTrack, setHoveredTrack] = useState<ParticleTrack | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [particlesIdentified, setParticlesIdentified] = useState(false)
  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([])
  const [viewScale, setViewScale] = useState(0.7) // 0.7 = intermediate zoom
  const [panX, setPanX] = useState(0) // Pan offset in X
  const [panY, setPanY] = useState(0) // Pan offset in Y
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [particleIdentifications, setParticleIdentifications] = useState<Record<number, string>>({})
  const [neutrinoCount, setNeutrinoCount] = useState<string>('')
  const [showForm, setShowForm] = useState(false) // Controla la visibilidad del formulario
  const [numberMapping, setNumberMapping] = useState<Record<number, number>>({}) // Maps original number -> shuffled number
  const [reverseMapping, setReverseMapping] = useState<Record<number, number>>({}) // Maps shuffled number -> original number

  // Track counter for decay products (electrons/positrons from muons)
  const decayProductCounterRef = useRef(0)
  
  // Cache refs for performance optimization
  const particleMapCache = useRef<{ tracks: ParticleTrack[]; map: Record<number, string> } | null>(null)
  const totalParticlesCache = useRef<{ tracks: ParticleTrack[]; count: number } | null>(null)
  const neutrinoCountCache = useRef<{ tracks: ParticleTrack[]; count: number } | null>(null)
  const mouseMoveTimeoutRef = useRef<number | null>(null)

  // Generate decorative spirals fixed to particle tracks - regenerate when tracks change
  const decorativeSpirals = useMemo(() => {
    if (tracks.length === 0) return []
    const spirals: Array<{ centerX: number; centerY: number; radius: number; turns: number; startAngle: number }> = []
    const numSpirals = 5 + Math.floor(Math.random() * 2) // 5-6 spirals
    // Generate spirals at random positions relative to the particle tracks
    for (let i = 0; i < numSpirals; i++) {
      spirals.push({
        centerX: Math.random() * 1000, // Will be scaled to actual width
        centerY: Math.random() * 1000, // Will be scaled to actual height
        radius: Math.random() * 8 + 4, // Smaller spirals: 4-12 pixels
        turns: 3, // Exactly 3 turns
        startAngle: Math.random() * Math.PI * 2
      })
    }
    return spirals
  }, [tracks]) // Regenerate when tracks change

  // Create a map of track number to actual particle symbol
  const getParticleMap = useCallback((tracks: ParticleTrack[]): Record<number, string> => {
    const map: Record<number, string> = {}
    let decayCounter = Math.max(...tracks.map(t => t.trackNumber || 0), 0)
    
    // Map main tracks with trackNumber
    tracks.forEach(track => {
      if (track.trackNumber !== undefined) {
        map[track.trackNumber] = track.symbol
      }
      
      // Map decay products: muons and electrons/positrons from muons
      if (track.decayProducts) {
        track.decayProducts.forEach(product => {
          if (product.muonCharge !== undefined) {
            decayCounter++
            // Muon symbol based on charge
            map[decayCounter] = product.muonCharge < 0 ? 'μ⁻' : 'μ⁺'
            
            if (product.leptonAngle !== undefined) {
              decayCounter++
              // Electron/positron symbol based on muon charge
              map[decayCounter] = product.muonCharge < 0 ? 'e⁻' : 'e⁺'
            }
          }
        })
      }
    })
    
    return map
  }, [])

  // Calculate total number of particles (including decay products) - optimized with cache
  const calculateTotalParticles = useCallback((tracks: ParticleTrack[]): number => {
    // Cache check
    if (totalParticlesCache.current && totalParticlesCache.current.tracks === tracks) {
      return totalParticlesCache.current.count
    }
    
    let total = 0
    // Count main tracks with trackNumber (includes protons, pions, π⁰, e⁻/e⁺ from π⁰)
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].trackNumber !== undefined) {
        total++
      }
    }
    
    // Count decay products: muons from pions, electrons/positrons from muons
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      if (track.decayProducts) {
        for (let j = 0; j < track.decayProducts.length; j++) {
          const product = track.decayProducts[j]
          if (product.muonCharge !== undefined) {
            total += 1 // Muon from pion decay
            if (product.leptonAngle !== undefined) {
              total += 1 // Electron/positron from muon decay
            }
          }
        }
      }
    }
    
    // Cache the result
    totalParticlesCache.current = { tracks, count: total }
    return total
  }, [])

  // Calculate total number of neutrinos emitted - optimized with cache
  const calculateNeutrinoCount = useCallback((tracks: ParticleTrack[]): number => {
    // Cache check
    if (neutrinoCountCache.current && neutrinoCountCache.current.tracks === tracks) {
      return neutrinoCountCache.current.count
    }
    
    let count = 0
    
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      if (track.decayProducts) {
        for (let j = 0; j < track.decayProducts.length; j++) {
          const product = track.decayProducts[j]
          // Neutron decay produces 1 neutrino (ν̄e)
          if (track.particleType === 'Neutrón' && product.pionNeutrinoAngle !== undefined && product.muonCharge === undefined) {
            count += 1
          }
          // Each pion decay produces 1 neutrino
          else if (product.pionNeutrinoAngle !== undefined && product.muonCharge !== undefined) {
            count += 1
          }
          // Each muon decay produces 2 neutrinos
          if (product.muonNeutrino1Angle !== undefined && product.muonNeutrino2Angle !== undefined) {
            count += 2
          }
        }
      }
    }
    
    // Cache the result
    neutrinoCountCache.current = { tracks, count }
    return count
  }, [])

  // Memoize particle map for score calculation
  const particleMapForScore = useMemo(() => getParticleMap(tracks), [tracks, getParticleMap])
  
  // Calculate score based on correct particle identifications
  const calculateScore = useCallback((): number => {
    const totalParticles = calculateTotalParticles(tracks)
    const realNeutrinoCount = calculateNeutrinoCount(tracks)
    
    if (totalParticles === 0) return 0
    
    // Find the hint particle (first electron or positron) - it's always correct
    let hintParticleNumber: number | null = null
    const particleMap = particleMapForScore
    for (let num = 1; num <= totalParticles; num++) {
      const symbol = particleMap[num] || ''
      if (symbol === 'e⁻' || symbol === 'e⁺') {
        hintParticleNumber = num
        break
      }
    }
    
    // Count correct particle identifications - optimized loop
    let correctParticles = 0
    const identKeys = Object.keys(particleIdentifications)
    for (let i = 0; i < identKeys.length; i++) {
      const shuffledNum = parseInt(identKeys[i])
      const originalNum = reverseMapping[shuffledNum] ?? shuffledNum
      const correctSymbol = particleMapForScore[originalNum] || ''
      const selectedValue = particleIdentifications[shuffledNum] || ''
      
      if (selectedValue === correctSymbol) {
        correctParticles++
      }
    }
    
    // Count the hint particle as correct if it exists (it's always shown as correct)
    // Check if hint particle is already counted in correctParticles
    let hintAlreadyCounted = false
    if (hintParticleNumber !== null) {
      // Find the shuffled number for the hint particle
      const hintShuffledNum = Object.keys(reverseMapping).find(
        shuffled => reverseMapping[parseInt(shuffled)] === hintParticleNumber
      )
      if (hintShuffledNum !== undefined) {
        const hintSelectedValue = particleIdentifications[parseInt(hintShuffledNum)] || ''
        const hintCorrectSymbol = particleMapForScore[hintParticleNumber] || ''
        // Check if hint particle is already counted as correct
        hintAlreadyCounted = hintSelectedValue === hintCorrectSymbol
      }
      // Always count hint as correct (it's shown as correct automatically)
      if (!hintAlreadyCounted) {
        correctParticles++
      }
    }
    
    let particlePoints = 0
    let neutrinoPoints = 0
    
    if (realNeutrinoCount > 0) {
      // When there are neutrinos: distribute points between particles and neutrinos
      // Total items to score: totalParticles (including hint) + realNeutrinoCount
      // Each correct item gets: 100 / (totalParticles + realNeutrinoCount)
      const totalItemsToScore = totalParticles + realNeutrinoCount
      const pointsPerItem = 100 / totalItemsToScore
      
      // Points from particles (including hint which is always correct)
      particlePoints = correctParticles * pointsPerItem
      
      // Points from neutrinos
      const correctNeutrinoCount = neutrinoCount !== '' && parseInt(neutrinoCount) === realNeutrinoCount ? realNeutrinoCount : 0
      neutrinoPoints = correctNeutrinoCount * pointsPerItem
    } else {
      // When there are NO neutrinos: all 100 points come from particles
      // Points per correct particle: 100 / totalParticles (including hint which is always correct)
      const pointsPerParticle = 100 / totalParticles
      particlePoints = correctParticles * pointsPerParticle
      neutrinoPoints = 0
    }
    
    // Total score: sum of particle points and neutrino points
    // When all particles and neutrinos are correct, this should equal 100
    // When there are no neutrinos and all particles are correct, this should also equal 100
    const totalScore = particlePoints + neutrinoPoints
    
    return Math.min(100, Math.max(0, totalScore))
  }, [particleIdentifications, neutrinoCount, tracks, calculateTotalParticles, calculateNeutrinoCount, particleMapForScore, reverseMapping])

  const generateNewEvent = useCallback(() => {
    const newTracks = generateParticleTracks(selectedProjectile)
    
    // Clear caches when generating new event
    particleMapCache.current = null
    totalParticlesCache.current = null
    neutrinoCountCache.current = null
    
    setTracks(newTracks)
    setParticlesIdentified(false) // Reset identification when generating new event
    setParticleIdentifications({}) // Reset form identifications
    setNeutrinoCount('') // Reset neutrino count
    setShowForm(false) // Hide form when generating new event
    setViewScale(0.7) // Reset zoom to intermediate level
    setPanX(0) // Reset pan to center
    setPanY(0)
    // Reset decay product counter - start from max track number + 1
    let maxTrackNumber = 0
    for (let i = 0; i < newTracks.length; i++) {
      const trackNum = newTracks[i].trackNumber || 0
      if (trackNum > maxTrackNumber) {
        maxTrackNumber = trackNum
      }
    }
    decayProductCounterRef.current = maxTrackNumber
    
    // Create number mapping with shuffle (keep 1 fixed for incoming proton)
    const totalParticles = calculateTotalParticles(newTracks)
    const numbers = Array.from({ length: totalParticles }, (_, i) => i + 1)
    // Keep 1 fixed, shuffle the rest
    const rest = numbers.slice(1)
    // Fisher-Yates shuffle
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]]
    }
    const shuffled = [1, ...rest]
    
    const mapping: Record<number, number> = {}
    const reverse: Record<number, number> = {}
    for (let i = 0; i < numbers.length; i++) {
      const original = numbers[i]
      const shuffledNum = shuffled[i]
      mapping[original] = shuffledNum
      reverse[shuffledNum] = original
    }
    
    setNumberMapping(mapping)
    setReverseMapping(reverse)
  }, [calculateTotalParticles, selectedProjectile])

  useEffect(() => {
    generateNewEvent()
  }, [generateNewEvent, selectedProjectile])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size with proper device pixel ratio
    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get current canvas dimensions (logical size)
    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const dpr = window.devicePixelRatio || 1

    // Clear with dark background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw background noise (bubble chamber grain) - use logical coordinates
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.15
    // Draw random noise points to simulate small bubbles in the chamber
    const noiseDensity = 0.0005 // Points per pixel
    const numNoisePoints = Math.floor(width * height * noiseDensity)
    for (let i = 0; i < numNoisePoints; i++) {
      const x = Math.random() * width
      const y = Math.random() * height
      const size = Math.random() * 1.0 + 0.3
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.restore()

    // Draw grid (subtle) - use logical coordinates
    // Optimized: batch grid lines
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    // Vertical lines
    for (let x = 0; x < width; x += GRID_SIZE) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    // Horizontal lines
    for (let y = 0; y < height; y += GRID_SIZE) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
    ctx.restore()

    // Draw particle tracks and collect label positions, applying zoom around center
    ctx.save()
    ctx.scale(dpr, dpr)

    const cx = width / 2
    const cy = height / 2
    ctx.translate(cx, cy)
    ctx.scale(viewScale, viewScale)
    // Pan is in screen pixels, so divide by scale to get logical coordinates
    ctx.translate(-cx + panX / viewScale, -cy + panY / viewScale)

    // Draw fixed decorative spirals (background electrons from collisions) - with zoom/pan
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.0 / viewScale // Scale line width with zoom
    decorativeSpirals.forEach((spiral) => {
      // Scale positions to normalized coordinates (0-1) then to canvas dimensions
      const centerX = (spiral.centerX / 1000) * width
      const centerY = (spiral.centerY / 1000) * height
      const radius = spiral.radius
      const turns = spiral.turns
      const startAngle = spiral.startAngle
      ctx.beginPath()
      const numPoints = Math.floor(80 * turns) // More points for more turns
      for (let t = 0; t <= numPoints; t++) {
        const angle = startAngle + t / numPoints * Math.PI * 2 * turns
        const r = (t / numPoints) * radius
        const x = centerX + Math.cos(angle) * r
        const y = centerY + Math.sin(angle) * r
        if (t === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    })

    const labelsLogical: LabelPosition[] = []
    
    // Reset decay product counter at start of each draw
    const maxTrackNumber = Math.max(...tracks.map(t => t.trackNumber || 0), 0)
    decayProductCounterRef.current = maxTrackNumber

    tracks.forEach((track) => {
      drawTrack(ctx, track, width, height, false, particlesIdentified, labelsLogical, decayProductCounterRef, numberMapping, showForm)
    })

    // Highlight hovered track
    if (hoveredTrack) {
      drawTrack(ctx, hoveredTrack, width, height, true, particlesIdentified, labelsLogical, decayProductCounterRef, numberMapping, showForm)
    }

    // Transform label positions into screen coordinates (after zoom and pan)
    const labelsScreen = labelsLogical.map((label) => {
      const x = (label.x - cx) * viewScale + cx + panX
      const y = (label.y - cy) * viewScale + cy + panY
      return { ...label, x, y }
    })
    setLabelPositions(labelsScreen)

    ctx.restore()
  }, [tracks, hoveredTrack, particlesIdentified, viewScale, panX, panY, numberMapping, showForm])

  const drawTrack = (
    ctx: CanvasRenderingContext2D,
    track: ParticleTrack,
    width: number,
    height: number,
    highlight: boolean = false,
    identified: boolean = false,
    labelPositions: LabelPosition[] = [],
    decayProductCounterRef?: React.MutableRefObject<number>,
    numberMapping?: Record<number, number>,
    showForm: boolean = false
  ) => {
    ctx.save()

    // Use white color if particles are not identified, otherwise use particle color
    const trackColor = identified ? track.color : '#ffffff'

    // For neutral particles that decay (like π⁰), show them when form is visible
    // so they can receive numbers and be identified
    // Hide neutral particle tracks (π⁰, γ, etc.) until particles are identified OR form is shown
    // Exception: if the particle has decayPoint (decays), show it when form is shown
    if (!identified && track.charge === 0 && !(showForm && track.decayPoint)) {
      ctx.restore()
      return
    }

    if (highlight) {
      ctx.shadowBlur = 10
      ctx.shadowColor = trackColor
      ctx.lineWidth = track.width * 1.5
    } else {
      ctx.lineWidth = track.width
    }

    ctx.strokeStyle = trackColor
    ctx.globalAlpha = highlight ? 1 : 0.8

    // For neutral particles (e.g. π⁰, γ) when identified OR when showing form (if they decay), draw as faint dashed lines
    let usedDashedNeutralStyle = false
    if (track.charge === 0 && (identified || (showForm && track.decayPoint))) {
      ctx.strokeStyle = identified ? '#666666' : '#888888' // Slightly lighter when not identified but form is shown
      ctx.lineWidth = Math.max(0.5, track.width * 0.7)
      ctx.setLineDash([2, 4])
      ctx.globalAlpha = identified ? 0.6 : 0.3 // Very faint when form is shown but not identified
      usedDashedNeutralStyle = true
    }

    // Draw main track
    if (track.type === 'spiral') {
      drawSpiral(ctx, track, width, height)
    } else if (track.type === 'curved') {
      drawCurvedTrack(ctx, track, width, height)
    } else if (track.type === 'straight') {
      drawStraightTrack(ctx, track, width, height)
    }

    // Draw decay kink if present
    if (track.decayPoint) {
      drawDecayKink(ctx, track, width, height, identified, labelPositions, decayProductCounterRef, numberMapping, showForm)
    }

    // Draw particle symbol at end of track if identified, or track number if not identified
    // For neutral particles, place label at midpoint; for charged particles, at end
    if (identified) {
      let labelPoint: { x: number; y: number } | null = null
      if (track.charge === 0) {
        // Neutral particles: label at midpoint
        labelPoint = getTrackMidPoint(track, width, height)
      } else {
        // Charged particles: label at end
        labelPoint = getTrackEndPoint(track, width, height)
      }
      
      if (labelPoint) {
        drawParticleLabel(ctx, track.symbol, labelPoint.x, labelPoint.y)
        // Store label position for hover detection
        labelPositions.push({
          track,
          x: labelPoint.x,
          y: labelPoint.y,
          symbol: track.symbol,
        })
      }
    } else if (track.trackNumber !== undefined && showForm) {
      // Show track number when particles are not identified AND form is shown
      let labelPoint: { x: number; y: number } | null = null
      if (track.charge === 0) {
        // Neutral particles: number at decay point if it decays, otherwise at midpoint
        if (track.decayPoint) {
          // Use decay point (where it decays) for neutral particles that decay
          labelPoint = {
            x: track.decayPoint.x * width,
            y: track.decayPoint.y * height
          }
        } else {
          // Neutral particles without decay: number at midpoint
          labelPoint = getTrackMidPoint(track, width, height)
        }
      } else {
        // Charged particles: number at end
        labelPoint = getTrackEndPoint(track, width, height)
      }
      
      if (labelPoint && track.trackNumber !== undefined) {
        const shuffledNumber = numberMapping?.[track.trackNumber] ?? track.trackNumber
        drawTrackNumber(ctx, shuffledNumber, labelPoint.x, labelPoint.y)
      }
    }

    // Reset dashed style for neutrals
    if (usedDashedNeutralStyle) {
      ctx.setLineDash([])
      ctx.globalAlpha = highlight ? 1 : 0.8
    }

    ctx.restore()
  }

  const drawTrackNumber = (
    ctx: CanvasRenderingContext2D,
    number: number,
    x: number,
    y: number
  ) => {
    ctx.save()
    
    // Set smaller font for track numbers to avoid overlap
    ctx.font = 'bold 14px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const text = number.toString()
    const metrics = ctx.measureText(text)
    const textWidth = metrics.width
    const textHeight = 16
    const padding = 5
    
    // Draw background circle for better visibility
    const radius = Math.max(textWidth / 2, textHeight / 2) + padding
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    
    // Draw number in black for contrast
    ctx.fillStyle = '#000000'
    ctx.fillText(text, x, y)
    
    ctx.restore()
  }

  const getTrackMidPoint = (
    track: ParticleTrack,
    width: number,
    height: number
  ): { x: number; y: number } | null => {
    if (track.type === 'straight') {
      const startX = track.origin.x * width
      const startY = track.origin.y * height
      const angle = track.angle || 0
      const length = track.length || 0.4
      // Midpoint is halfway along the track
      return {
        x: startX + Math.cos(angle) * length * width * 0.5,
        y: startY + Math.sin(angle) * length * height * 0.5,
      }
    } else if (track.type === 'curved') {
      const startX = track.origin.x * width
      const startY = track.origin.y * height
      const radius = (track.radius || 0.2) * Math.min(width, height)
      const angle = track.angle || 0
      const length = track.length || 0.3
      // Midpoint angle is halfway through the arc
      const midAngle = angle + length * Math.PI * 2 * 0.5
      const centerX = startX - Math.cos(angle) * radius
      const centerY = startY - Math.sin(angle) * radius
      return {
        x: centerX + Math.cos(midAngle) * radius,
        y: centerY + Math.sin(midAngle) * radius,
      }
    } else if (track.type === 'spiral') {
      // For spirals, use the origin (center for growing, outer edge for shrinking)
      const originX = track.origin.x * width
      const originY = track.origin.y * height
      return { x: originX, y: originY }
    }
    return null
  }

  const getTrackEndPoint = (
    track: ParticleTrack,
    width: number,
    height: number
  ): { x: number; y: number } | null => {
    if (track.type === 'straight') {
      const startX = track.origin.x * width
      const startY = track.origin.y * height
      const angle = track.angle || 0
      const length = track.length || 0.4
      return {
        // Must match drawStraightTrack: length is normalized separately
        x: startX + Math.cos(angle) * length * width,
        y: startY + Math.sin(angle) * length * height,
      }
    } else if (track.type === 'curved') {
      const startX = track.origin.x * width
      const startY = track.origin.y * height
      const radius = (track.radius || 0.2) * Math.min(width, height)
      const angle = track.angle || 0
      const length = track.length || 0.3
      const endAngle = angle + length * Math.PI * 2
      const centerX = startX - Math.cos(angle) * radius
      const centerY = startY - Math.sin(angle) * radius
      return {
        x: centerX + Math.cos(endAngle) * radius,
        y: centerY + Math.sin(endAngle) * radius,
      }
    } else if (track.type === 'spiral') {
      const originX = track.origin.x * width
      const originY = track.origin.y * height
      const radius = (track.radius || 0.1) * Math.min(width, height)
      const baseAngle = track.angle || 0
      const turns = track.turns || 3
      const handedness = track.charge < 0 ? -1 : 1

      if (track.shrinkSpiral) {
        // For shrinking spirals (e.g. e⁺e⁻ from π⁰), the *center* is the end
        // point (r → 0). Compute center as in drawSpiral.
        const centerX = originX - Math.cos(baseAngle) * radius
        const centerY = originY - Math.sin(baseAngle) * radius
        return { x: centerX, y: centerY }
      }

      // Growing spiral: origin is the center, label at outer edge after all turns
      const centerX = originX
      const centerY = originY
      const endAngle = baseAngle + handedness * turns * Math.PI * 2
      return {
        x: centerX + Math.cos(endAngle) * radius,
        y: centerY + Math.sin(endAngle) * radius,
      }
    }
    return null
  }

  const getLineCanvasIntersection = (
    startX: number,
    startY: number,
    angle: number,
    width: number,
    height: number
  ): { x: number; y: number } => {
    // Calculate intersection with canvas boundaries
    // Line equation: y = startY + tan(angle) * (x - startX)
    // Or parametric: x = startX + t * cos(angle), y = startY + t * sin(angle)
    
    const cosAngle = Math.cos(angle)
    const sinAngle = Math.sin(angle)
    
    // Calculate intersections with all four boundaries
    const intersections: Array<{ x: number; y: number; t: number }> = []
    
    // Left boundary (x = 0)
    if (cosAngle < 0) {
      const t = (0 - startX) / cosAngle
      const y = startY + t * sinAngle
      if (y >= 0 && y <= height) {
        intersections.push({ x: 0, y, t })
      }
    }
    
    // Right boundary (x = width)
    if (cosAngle > 0) {
      const t = (width - startX) / cosAngle
      const y = startY + t * sinAngle
      if (y >= 0 && y <= height) {
        intersections.push({ x: width, y, t })
      }
    }
    
    // Top boundary (y = 0)
    if (sinAngle < 0) {
      const t = (0 - startY) / sinAngle
      const x = startX + t * cosAngle
      if (x >= 0 && x <= width) {
        intersections.push({ x, y: 0, t })
      }
    }
    
    // Bottom boundary (y = height)
    if (sinAngle > 0) {
      const t = (height - startY) / sinAngle
      const x = startX + t * cosAngle
      if (x >= 0 && x <= width) {
        intersections.push({ x, y: height, t })
      }
    }
    
    // Return the intersection with the smallest positive t (closest to start point)
    if (intersections.length > 0) {
      const closest = intersections.reduce((min, curr) => 
        curr.t > 0 && (min.t <= 0 || curr.t < min.t) ? curr : min
      )
      return { x: closest.x, y: closest.y }
    }
    
    // Fallback: return a point far away if no intersection found
    return {
      x: startX + Math.cos(angle) * Math.max(width, height) * 2,
      y: startY + Math.sin(angle) * Math.max(width, height) * 2,
    }
  }

  const drawParticleLabel = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
  ) => {
    ctx.save()
    
    // Set larger font for better visibility, especially for superscripts
    ctx.font = 'bold 18px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Measure text for background
    const metrics = ctx.measureText(text)
    const textWidth = metrics.width
    const textHeight = 22
    const padding = 6
    
    // Draw background rectangle for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(
      x - textWidth / 2 - padding,
      y - textHeight / 2 - padding,
      textWidth + padding * 2,
      textHeight + padding * 2
    )
    
    // Draw text with better contrast
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 0.5
    // Draw text with stroke for better visibility
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
    
    ctx.restore()
  }

  const drawSpiral = (
    ctx: CanvasRenderingContext2D,
    track: ParticleTrack,
    width: number,
    height: number
  ) => {
    const originX = track.origin.x * width
    const originY = track.origin.y * height
    const radius = (track.radius || 0.1) * Math.min(width, height)
    const turns = track.turns || 3
    // Handedness of spiral depends on charge: positive and negative curve opposite ways
    const handedness = track.charge < 0 ? -1 : 1
    const baseAngle = track.angle || 0
    const shrink = track.shrinkSpiral

    // For shrinking spirals (used e.g. for e⁺e⁻ from π⁰), the origin is the
    // outer edge at the decay point. Compute the spiral center so that at t=0
    // (r = radius) the curve passes exactly through the origin point.
    let centerX = originX
    let centerY = originY
    if (shrink) {
      centerX = originX - Math.cos(baseAngle) * radius
      centerY = originY - Math.sin(baseAngle) * radius
    } else {
      // Growing spirals use origin as the center
      centerX = originX
      centerY = originY
    }

    ctx.beginPath()
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const angle = baseAngle + handedness * t * Math.PI * 2 * turns
      const r = shrink ? radius * (1 - t) : radius * t
      const x = centerX + Math.cos(angle) * r
      const y = centerY + Math.sin(angle) * r
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  const drawCurvedTrack = (
    ctx: CanvasRenderingContext2D,
    track: ParticleTrack,
    width: number,
    height: number
  ) => {
    const startX = track.origin.x * width
    const startY = track.origin.y * height
    const radius = (track.radius || 0.2) * Math.min(width, height)
    const angle = track.angle || 0
    const length = track.length || 0.3

    ctx.beginPath()
    ctx.arc(
      startX - Math.cos(angle) * radius,
      startY - Math.sin(angle) * radius,
      radius,
      angle,
      angle + length * Math.PI * 2,
      track.charge < 0
    )
    ctx.stroke()
  }

  const drawStraightTrack = (
    ctx: CanvasRenderingContext2D,
    track: ParticleTrack,
    width: number,
    height: number
  ) => {
    const startX = track.origin.x * width
    const startY = track.origin.y * height
    const angle = track.angle || 0
    const length = track.length || 0.4

    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(
      startX + Math.cos(angle) * length * width,
      startY + Math.sin(angle) * length * height
    )
    ctx.stroke()
  }

  const drawDecayKink = (
    ctx: CanvasRenderingContext2D,
    track: ParticleTrack,
    width: number,
    height: number,
    identified: boolean = false,
    labelPositions: LabelPosition[] = [],
    decayProductCounterRef?: React.MutableRefObject<number>,
    numberMapping?: Record<number, number>,
    showForm: boolean = false
  ) => {
    if (!track.decayPoint || !track.decayProducts) return

    // Calculate the exact end point of the track
    // This ensures the muon starts exactly where the pion ends
    const startX = track.origin.x * width
    const startY = track.origin.y * height
    let kinkX: number
    let kinkY: number
    
    if (track.type === 'straight') {
      // For straight tracks, calculate end point directly
      const angle = track.angle || 0
      const length = track.length || 0.3
      kinkX = startX + Math.cos(angle) * length * width
      kinkY = startY + Math.sin(angle) * length * height
    } else {
      // For curved tracks, use arc calculation
      const radius = (track.radius || 0.2) * Math.min(width, height)
      const angle = track.angle || 0
      const length = track.length || 0.3
      
      // Calculate arc center (same as in drawCurvedTrack)
      const centerX = startX - Math.cos(angle) * radius
      const centerY = startY - Math.sin(angle) * radius
      
      // Calculate exact end point of track
      const endAngle = angle + length * Math.PI * 2
      kinkX = centerX + Math.cos(endAngle) * radius
      kinkY = centerY + Math.sin(endAngle) * radius
    }

    // Handle muon decay case (muon entering and decaying directly: μ⁻ → e⁻ + ν̄e + νμ)
    // Muon has charge and decayProducts with muonNeutrino1Angle and muonNeutrino2Angle but no pionNeutrinoAngle
    const isDirectMuonDecay = (track.charge === 1 || track.charge === -1) && track.particleType === 'Muón' &&
                               track.decayProducts && track.decayProducts.length > 0 &&
                               track.decayProducts[0].muonNeutrino1Angle !== undefined &&
                               track.decayProducts[0].muonNeutrino2Angle !== undefined &&
                               track.decayProducts[0].pionNeutrinoAngle === undefined

    if (isDirectMuonDecay) {
      // For direct muon decay, electron/positron is already in tracks array
      // We just need to draw the neutrinos
      const product = track.decayProducts[0]
      if (identified && product.muonNeutrino1Angle !== undefined && product.muonNeutrino2Angle !== undefined) {
        ctx.save()
        ctx.strokeStyle = '#ffffff' // White
        ctx.lineWidth = 2.0 // Thicker line for better visibility
        ctx.setLineDash([2, 4]) // Dotted line
        ctx.globalAlpha = 0.9 // More visible
        
        // Calculate intersection with canvas boundaries
        const decayX = track.decayPoint!.x * width
        const decayY = track.decayPoint!.y * height
        
        // First neutrino from muon decay (νe or ν̄e)
        const neutrino1End = getLineCanvasIntersection(
          decayX, decayY, product.muonNeutrino1Angle, width, height
        )
        ctx.beginPath()
        ctx.moveTo(decayX, decayY)
        ctx.lineTo(neutrino1End.x, neutrino1End.y)
        ctx.stroke()
        
        // Draw neutrino label at midpoint
        const neutrino1MidX = (decayX + neutrino1End.x) / 2
        const neutrino1MidY = (decayY + neutrino1End.y) / 2
        // μ⁻ → e⁻ + ν̄e + νμ, so first neutrino is ν̄e
        // μ⁺ → e⁺ + νe + ν̄μ, so first neutrino is νe
        const neutrino1Symbol = track.charge < 0 ? 'ν̄e' : 'νe'
        drawParticleLabel(ctx, neutrino1Symbol, neutrino1MidX, neutrino1MidY)
        
        // Store neutrino label position for hover detection
        const neutrino1Track: ParticleTrack = {
          name: track.charge < 0 ? 'Antineutrino Electrónico (ν̄e)' : 'Neutrino Electrónico (νe)',
          symbol: neutrino1Symbol,
          particleType: 'Neutrino',
          charge: 0,
          momentum: 0,
          origin: { x: decayX / width, y: decayY / height },
          type: 'straight',
          color: '#ffffff',
          width: 0.5,
          description: 'Leptón neutro, sin carga, interacción mínima, no deja trayectoria visible',
        }
        labelPositions.push({
          track: neutrino1Track,
          x: neutrino1MidX,
          y: neutrino1MidY,
          symbol: neutrino1Symbol,
        })
        
        // Second neutrino from muon decay (νμ or ν̄μ)
        const neutrino2End = getLineCanvasIntersection(
          decayX, decayY, product.muonNeutrino2Angle, width, height
        )
        ctx.beginPath()
        ctx.moveTo(decayX, decayY)
        ctx.lineTo(neutrino2End.x, neutrino2End.y)
        ctx.stroke()
        
        // Draw neutrino label at midpoint
        const neutrino2MidX = (decayX + neutrino2End.x) / 2
        const neutrino2MidY = (decayY + neutrino2End.y) / 2
        // μ⁻ → e⁻ + ν̄e + νμ, so second neutrino is νμ
        // μ⁺ → e⁺ + νe + ν̄μ, so second neutrino is ν̄μ
        const neutrino2Symbol = track.charge < 0 ? 'νμ' : 'ν̄μ'
        drawParticleLabel(ctx, neutrino2Symbol, neutrino2MidX, neutrino2MidY)
        
        // Store neutrino label position for hover detection
        const neutrino2Track: ParticleTrack = {
          name: track.charge < 0 ? 'Neutrino Muónico (νμ)' : 'Antineutrino Muónico (ν̄μ)',
          symbol: neutrino2Symbol,
          particleType: 'Neutrino',
          charge: 0,
          momentum: 0,
          origin: { x: decayX / width, y: decayY / height },
          type: 'straight',
          color: '#ffffff',
          width: 0.5,
          description: 'Leptón neutro, sin carga, interacción mínima, no deja trayectoria visible',
        }
        labelPositions.push({
          track: neutrino2Track,
          x: neutrino2MidX,
          y: neutrino2MidY,
          symbol: neutrino2Symbol,
        })
        
        ctx.setLineDash([]) // Reset dash
        ctx.globalAlpha = 1 // Reset alpha
        ctx.restore()
      }
      
      // Draw electron/positron from muon decay (already in tracks, but draw it here if needed)
      if (product.leptonAngle !== undefined && product.muonCharge !== undefined) {
        // Electron/positron is already drawn as part of tracks array, so we don't need to draw it again
        // But we need to make sure it's drawn correctly
      }
      
      ctx.restore()
      return // Muon decay products (electron/positron) are already in tracks array
    }

    // Handle neutron decay case (neutron → p + e⁻ + ν̄e)
    // Neutron has charge 0 and decayProducts with pionNeutrinoAngle but no muonCharge
    const isNeutronDecay = track.charge === 0 && track.particleType === 'Neutrón' && 
                           track.decayProducts && track.decayProducts.length > 0 &&
                           track.decayProducts[0].pionNeutrinoAngle !== undefined &&
                           track.decayProducts[0].muonCharge === undefined

    if (isNeutronDecay) {
      // For neutron decay, draw neutrino directly (proton and electron are already in tracks)
      const product = track.decayProducts[0]
      if (identified && product.pionNeutrinoAngle !== undefined) {
        ctx.save()
        ctx.strokeStyle = '#ffffff' // White
        ctx.lineWidth = 2.0 // Thicker line for better visibility
        ctx.setLineDash([2, 4]) // Dotted line
        ctx.globalAlpha = 0.9 // More visible
        
        // Calculate intersection with canvas boundaries
        const decayX = track.decayPoint!.x * width
        const decayY = track.decayPoint!.y * height
        const neutrinoEnd = getLineCanvasIntersection(
          decayX, decayY, product.pionNeutrinoAngle, width, height
        )
        
        ctx.beginPath()
        ctx.moveTo(decayX, decayY)
        ctx.lineTo(neutrinoEnd.x, neutrinoEnd.y)
        ctx.stroke()
        
        // Draw neutrino label at midpoint
        const neutrinoMidX = (decayX + neutrinoEnd.x) / 2
        const neutrinoMidY = (decayY + neutrinoEnd.y) / 2
        const neutrinoSymbol = 'ν̄e' // Antineutrino electrónico del decaimiento del neutrón
        drawParticleLabel(ctx, neutrinoSymbol, neutrinoMidX, neutrinoMidY)
        
        // Store neutrino label position for hover detection
        const neutrinoTrack: ParticleTrack = {
          name: 'Antineutrino Electrónico (ν̄e)',
          symbol: neutrinoSymbol,
          particleType: 'Neutrino',
          charge: 0,
          momentum: 0,
          origin: { x: decayX / width, y: decayY / height },
          type: 'straight',
          color: '#ffffff',
          width: 0.5,
          description: 'Antineutrino electrónico del decaimiento del neutrón',
        }
        labelPositions.push({
          track: neutrinoTrack,
          x: neutrinoMidX,
          y: neutrinoMidY,
          symbol: neutrinoSymbol,
        })
        
        ctx.setLineDash([]) // Reset dash
        ctx.globalAlpha = 1 // Reset alpha
        ctx.restore()
      }
      return // Neutron decay products (proton, electron) are already in tracks array
    }

    // Draw decay products (muons) as curved tracks starting from decay point
    track.decayProducts.forEach((product, index) => {
      ctx.save()
      ctx.strokeStyle = identified ? product.color : '#ffffff'
      ctx.lineWidth = product.width
      
      // Draw muon as a curved track starting from decay point
      const muonAngle = product.angle
      const muonLength = product.length
      // Use muon radius from product if available, otherwise default
      const muonRadiusNormalized = product.radius || 0.15
      const muonRadius = muonRadiusNormalized * Math.min(width, height)
      
      // Calculate arc center - muon track starts at decay point
      // For curved tracks, center is offset from start point
      const muonCenterX = kinkX - Math.cos(muonAngle) * muonRadius
      const muonCenterY = kinkY - Math.sin(muonAngle) * muonRadius
      
      // Draw curved muon track
      ctx.beginPath()
      ctx.arc(
        muonCenterX,
        muonCenterY,
        muonRadius,
        muonAngle,
        muonAngle + muonLength * Math.PI * 2,
        track.charge < 0 // Muon charge matches pion charge
      )
      ctx.stroke()
      
      // Calculate muon track end point (where it decays)
      const muonEndAngle = muonAngle + muonLength * Math.PI * 2
      const muonDecayX = muonCenterX + Math.cos(muonEndAngle) * muonRadius
      const muonDecayY = muonCenterY + Math.sin(muonEndAngle) * muonRadius
      
      // Draw neutrino from pion decay (dotted white line) if identified
      if (identified && product.pionNeutrinoAngle !== undefined) {
        ctx.save()
        ctx.strokeStyle = '#ffffff' // White
        ctx.lineWidth = 2.0 // Thicker line for better visibility
        ctx.setLineDash([2, 4]) // Dotted line (small dots)
        ctx.globalAlpha = 0.9 // More visible
        
        // Calculate intersection with canvas boundaries
        const neutrinoEnd = getLineCanvasIntersection(
          kinkX, kinkY, product.pionNeutrinoAngle, width, height
        )
        
        ctx.beginPath()
        ctx.moveTo(kinkX, kinkY)
        ctx.lineTo(neutrinoEnd.x, neutrinoEnd.y)
        ctx.stroke()
        
        // Draw neutrino label at midpoint
        const neutrinoMidX = (kinkX + neutrinoEnd.x) / 2
        const neutrinoMidY = (kinkY + neutrinoEnd.y) / 2
        // Determine neutrino symbol based on pion charge: π⁻ → ν̄μ, π⁺ → νμ
        const neutrinoSymbol = track.charge < 0 ? 'ν̄μ' : 'νμ'
        drawParticleLabel(ctx, neutrinoSymbol, neutrinoMidX, neutrinoMidY)
        
        // Store neutrino label position for hover detection
        const neutrinoTrack: ParticleTrack = {
          name: track.charge < 0 ? 'Antineutrino Muónico (ν̄μ)' : 'Neutrino Muónico (νμ)',
          symbol: neutrinoSymbol,
          particleType: 'Neutrino',
          charge: 0,
          momentum: 0, // Neutrinos have very low interaction, momentum not directly measurable
          origin: { x: kinkX / width, y: kinkY / height },
          type: 'straight',
          color: '#ffffff',
          width: 0.5,
          description: 'Leptón neutro, sin carga, interacción mínima, no deja trayectoria visible',
        }
        labelPositions.push({
          track: neutrinoTrack,
          x: neutrinoMidX,
          y: neutrinoMidY,
          symbol: neutrinoSymbol,
        })
        
        ctx.setLineDash([]) // Reset dash
        ctx.globalAlpha = 1 // Reset alpha
        ctx.restore()
      }
      
      // Draw muon label at end of track if identified, or track number if not identified
      if (!identified && showForm && decayProductCounterRef) {
        // Assign track number to muon when not identified AND form is shown
        decayProductCounterRef.current++
        const originalNumber = decayProductCounterRef.current
        const shuffledNumber = numberMapping?.[originalNumber] ?? originalNumber
        drawTrackNumber(ctx, shuffledNumber, muonDecayX, muonDecayY)
      } else if (identified) {
        // Determine muon symbol based on pion charge
        const muonSymbol = track.charge < 0 ? 'μ⁻' : 'μ⁺'
        drawParticleLabel(ctx, muonSymbol, muonDecayX, muonDecayY)
        // Store muon label position (create a proper muon track with correct info)
        const muonTrack: ParticleTrack = {
          name: track.charge < 0 ? 'Muón (μ⁻)' : 'Muón (μ⁺)',
          symbol: muonSymbol,
          particleType: 'Muón',
          charge: track.charge,
          momentum: product.muonMomentum || 10,
          origin: { x: 0, y: 0 },
          type: 'curved',
          color: '#4dabf7',
          width: 2,
          description: 'Leptón pesado, interacción mínima, trayectoria curva larga',
        }
        labelPositions.push({
          track: muonTrack,
          x: muonDecayX,
          y: muonDecayY,
          symbol: muonSymbol,
        })
      }
      
      // Draw electron or positron from muon decay
      // μ⁻ → e⁻ + ν̄e + νμ or μ⁺ → e⁺ + νe + ν̄μ
      if (product.leptonAngle !== undefined && product.muonCharge !== undefined) {
        // Use the calculated muon decay point (end of muon track) in pixel coordinates
        const muonDecayPointX = muonDecayX
        const muonDecayPointY = muonDecayY
        
        // Determine if it's electron or positron based on muon charge
        const isElectron = product.muonCharge < 0 // μ⁻ decays to e⁻
        const leptonColor = identified ? (isElectron ? '#ffd43b' : '#ff8787') : '#ffffff'
        const leptonSymbol = isElectron ? 'e⁻' : 'e⁺'
        
        // Draw electron/positron as spiral that shrinks inward
        ctx.strokeStyle = leptonColor
        ctx.lineWidth = 1.5
        const leptonRadius = 0.08 * Math.min(width, height)
        const leptonTurns = 3
        const handedness = isElectron ? -1 : 1
        
        // Calculate spiral center so it starts at muon decay point and spirals inward
        const spiralStartAngle = product.leptonAngle
        const spiralCenterX = muonDecayPointX - Math.cos(spiralStartAngle) * leptonRadius
        const spiralCenterY = muonDecayPointY - Math.sin(spiralStartAngle) * leptonRadius
        
        ctx.beginPath()
        for (let i = 0; i <= 100; i++) {
          // Spiral angle increases as we go inward
          const spiralAngle =
            product.leptonAngle + handedness * (i / 100) * Math.PI * 2 * leptonTurns
          // Radius decreases from leptonRadius to 0 (shrinking spiral)
          const r = leptonRadius * (1 - i / 100)
          const x = spiralCenterX + Math.cos(spiralAngle) * r
          const y = spiralCenterY + Math.sin(spiralAngle) * r
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
        
        // Draw electron/positron label at the center (end of shrinking spiral)
        // Assign track number if not identified
        if (!identified && showForm && decayProductCounterRef) {
          decayProductCounterRef.current++
          const originalNumber = decayProductCounterRef.current
          const shuffledNumber = numberMapping?.[originalNumber] ?? originalNumber
          drawTrackNumber(ctx, shuffledNumber, spiralCenterX, spiralCenterY)
        } else if (identified) {
          const leptonEndAngle = product.leptonAngle + leptonTurns * Math.PI * 2
          // At the end, radius is 0, so label is at the center
          drawParticleLabel(ctx, leptonSymbol, spiralCenterX, spiralCenterY)
          // Store lepton label position with correct particle info
          const leptonTrack: ParticleTrack = {
            name: isElectron ? 'Electrón (e⁻)' : 'Positrón (e⁺)',
            symbol: leptonSymbol,
            particleType: isElectron ? 'Electrón' : 'Positrón',
            charge: isElectron ? -1 : 1,
            momentum: 2.5, // Low momentum for electrons/positrons
            origin: { x: 0, y: 0 },
            type: 'spiral',
            color: isElectron ? '#ffd43b' : '#ff8787',
            width: 1.5,
            description: isElectron 
              ? 'Leptón ligero, pierde energía rápidamente, forma espiral cerrada'
              : 'Antipartícula del electrón, forma espiral cerrada',
          }
          labelPositions.push({
            track: leptonTrack,
            x: spiralCenterX,
            y: spiralCenterY,
            symbol: leptonSymbol,
          })
        }
        
        // Draw neutrinos from muon decay (dotted white lines) if identified
        if (identified && product.muonNeutrino1Angle !== undefined && product.muonNeutrino2Angle !== undefined) {
          ctx.save()
          ctx.strokeStyle = '#ffffff' // White
          ctx.lineWidth = 2.0 // Thicker line for better visibility
          ctx.setLineDash([2, 4]) // Dotted line (small dots)
          ctx.globalAlpha = 0.9 // More visible
          
          // First neutrino from muon decay (νe or ν̄e)
          const neutrino1End = getLineCanvasIntersection(
            muonDecayPointX, muonDecayPointY, product.muonNeutrino1Angle, width, height
          )
          ctx.beginPath()
          ctx.moveTo(muonDecayPointX, muonDecayPointY)
          ctx.lineTo(neutrino1End.x, neutrino1End.y)
          ctx.stroke()
          
          // Draw neutrino label at midpoint
          const neutrino1MidX = (muonDecayPointX + neutrino1End.x) / 2
          const neutrino1MidY = (muonDecayPointY + neutrino1End.y) / 2
          // μ⁻ → e⁻ + ν̄e + νμ, so first neutrino is ν̄e
          // μ⁺ → e⁺ + νe + ν̄μ, so first neutrino is νe
          const neutrino1Symbol = product.muonCharge && product.muonCharge < 0 ? 'ν̄e' : 'νe'
          drawParticleLabel(ctx, neutrino1Symbol, neutrino1MidX, neutrino1MidY)
          
          // Store neutrino label position for hover detection
          const neutrino1Track: ParticleTrack = {
            name: product.muonCharge && product.muonCharge < 0 ? 'Antineutrino Electrónico (ν̄e)' : 'Neutrino Electrónico (νe)',
            symbol: neutrino1Symbol,
            particleType: 'Neutrino',
            charge: 0,
            momentum: 0,
            origin: { x: muonDecayPointX / width, y: muonDecayPointY / height },
            type: 'straight',
            color: '#ffffff',
            width: 0.5,
            description: 'Leptón neutro, sin carga, interacción mínima, no deja trayectoria visible',
          }
          labelPositions.push({
            track: neutrino1Track,
            x: neutrino1MidX,
            y: neutrino1MidY,
            symbol: neutrino1Symbol,
          })
          
          // Second neutrino from muon decay (νμ or ν̄μ)
          const neutrino2End = getLineCanvasIntersection(
            muonDecayPointX, muonDecayPointY, product.muonNeutrino2Angle, width, height
          )
          ctx.beginPath()
          ctx.moveTo(muonDecayPointX, muonDecayPointY)
          ctx.lineTo(neutrino2End.x, neutrino2End.y)
          ctx.stroke()
          
          // Draw neutrino label at midpoint
          const neutrino2MidX = (muonDecayPointX + neutrino2End.x) / 2
          const neutrino2MidY = (muonDecayPointY + neutrino2End.y) / 2
          // μ⁻ → e⁻ + ν̄e + νμ, so second neutrino is νμ
          // μ⁺ → e⁺ + νe + ν̄μ, so second neutrino is ν̄μ
          const neutrino2Symbol = product.muonCharge && product.muonCharge < 0 ? 'νμ' : 'ν̄μ'
          drawParticleLabel(ctx, neutrino2Symbol, neutrino2MidX, neutrino2MidY)
          
          // Store neutrino label position for hover detection
          const neutrino2Track: ParticleTrack = {
            name: product.muonCharge && product.muonCharge < 0 ? 'Neutrino Muónico (νμ)' : 'Antineutrino Muónico (ν̄μ)',
            symbol: neutrino2Symbol,
            particleType: 'Neutrino',
            charge: 0,
            momentum: 0,
            origin: { x: muonDecayPointX / width, y: muonDecayPointY / height },
            type: 'straight',
            color: '#ffffff',
            width: 0.5,
            description: 'Leptón neutro, sin carga, interacción mínima, no deja trayectoria visible',
          }
          labelPositions.push({
            track: neutrino2Track,
            x: neutrino2MidX,
            y: neutrino2MidY,
            symbol: neutrino2Symbol,
          })
          
          ctx.setLineDash([]) // Reset dash
          ctx.globalAlpha = 1 // Reset alpha
          ctx.restore()
        }
      }
      
      ctx.restore()
    })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only handle left mouse button (button 0)
    if (e.button === 0) {
      const canvas = canvasRef.current
      if (!canvas) return
      
      const rect = canvas.getBoundingClientRect()
      const pixelX = e.clientX - rect.left
      const pixelY = e.clientY - rect.top
      
      // Check if clicking on a label - if so, don't start panning
      let clickedOnLabel = false
      if (particlesIdentified && labelPositions.length > 0) {
        const labelThreshold = 30
        for (const label of labelPositions) {
          const dist = Math.sqrt(
            Math.pow(pixelX - label.x, 2) + Math.pow(pixelY - label.y, 2)
          )
          if (dist < labelThreshold) {
            clickedOnLabel = true
            break
          }
        }
      }
      
      // Only start panning if not clicking on a label
      if (!clickedOnLabel) {
        e.preventDefault()
        setIsDragging(true)
        setDragStart({ x: pixelX, y: pixelY })
      }
    }
  }

  // Throttle mouse move for better performance
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const pixelX = e.clientX - rect.left
    const pixelY = e.clientY - rect.top

    setMousePos({ x: e.clientX, y: e.clientY })

    // Handle panning with left mouse button (no throttling for panning)
    if (isDragging) {
      const deltaX = pixelX - dragStart.x
      const deltaY = pixelY - dragStart.y
      setPanX((prev) => prev + deltaX)
      setPanY((prev) => prev + deltaY)
      setDragStart({ x: pixelX, y: pixelY })
      setHoveredTrack(null) // Clear hover when dragging
      return // Don't process hover when dragging
    }

    // Throttle hover detection to improve performance
    if (mouseMoveTimeoutRef.current) {
      return
    }

    mouseMoveTimeoutRef.current = window.setTimeout(() => {
      mouseMoveTimeoutRef.current = null
      
      // First check if mouse is over a label (if particles are identified)
      let hoveredLabelTrack: ParticleTrack | null = null
      if (particlesIdentified && labelPositions.length > 0) {
        let closestLabel: LabelPosition | null = null
        let minLabelDistSq = LABEL_THRESHOLD * LABEL_THRESHOLD // Use squared distance to avoid sqrt
        
        for (let i = 0; i < labelPositions.length; i++) {
          const label = labelPositions[i]
          const dx = pixelX - label.x
          const dy = pixelY - label.y
          const distSq = dx * dx + dy * dy
          if (distSq < minLabelDistSq) {
            minLabelDistSq = distSq
            closestLabel = label
          }
        }
        
        if (closestLabel) {
          hoveredLabelTrack = closestLabel.track
        }
      }

      // If hovering over a label, use that track
      if (hoveredLabelTrack) {
        setHoveredTrack(hoveredLabelTrack)
        return
      }

      // Otherwise, find closest track
      let closest: ParticleTrack | null = null
      let minDistSq = TRACK_HOVER_THRESHOLD * TRACK_HOVER_THRESHOLD

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        const dx = track.origin.x - x
        const dy = track.origin.y - y
        const distSq = dx * dx + dy * dy
        if (distSq < minDistSq) {
          minDistSq = distSq
          closest = track
        }
      }

      setHoveredTrack(closest)
    }, 16) // ~60fps throttling
  }, [isDragging, dragStart, particlesIdentified, labelPositions, tracks])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredTrack(null)
    setIsDragging(false) // Stop dragging if mouse leaves canvas
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current)
      mouseMoveTimeoutRef.current = null
    }
  }, [])

  const clamp = useCallback((value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value)), [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR
    setViewScale((prev) => clamp(prev * zoomFactor, ZOOM_MIN, ZOOM_MAX))
  }, [clamp])

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <div className={styles.buttonGroup} style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedProjectile}
            onChange={(e) => {
              setSelectedProjectile(e.target.value)
              setParticlesIdentified(false)
              setShowForm(false)
            }}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              backgroundColor: '#1a1a1a',
              color: '#e0e0e0',
              border: '1px solid #4dabf7',
              borderRadius: '6px',
              cursor: 'pointer',
              minWidth: '200px',
            }}
          >
            {PROJECTILE_CONFIGS.map((config: { id: string; name: string }) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
          <button onClick={generateNewEvent} className={styles.button}>
            Generar Nuevo Evento
          </button>
        </div>
        <div className={styles.info}>
          <p>
            {particlesIdentified 
              ? '¡Partículas identificadas! Pasa el cursor sobre las trayectorias para ver detalles.' 
              : 'Todas las trayectorias se muestran en blanco. Haz clic en "Identificar Partículas" para revelar los tipos de partículas.'}
          </p>
          <p className={styles.hint}>
            Haz clic en "Generar Nuevo Evento" para ver diferentes interacciones de partículas
          </p>
        </div>
      </div>

        <div className={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
          />
          <div className={styles.zoomControls}>
            <div className={styles.zoomButtons}>
              <button
                onClick={() =>
                  setViewScale((prev) => clamp(prev * 1.1, 0.5, 3))
                }
                className={styles.zoomButton}
                title="Acercar"
              >
                <span className={styles.zoomIcon}>+</span>
              </button>
              <button
                onClick={() => {
                  setViewScale(0.7)
                  setPanX(0)
                  setPanY(0)
                }}
                className={styles.zoomButton}
                title="Restablecer zoom"
              >
                <span className={styles.zoomIcon}>⌂</span>
              </button>
              <button
                onClick={() =>
                  setViewScale((prev) => clamp(prev / 1.1, 0.5, 3))
                }
                className={styles.zoomButton}
                title="Alejar"
              >
                <span className={styles.zoomIcon}>−</span>
              </button>
            </div>
            <div className={styles.panButtons}>
              <button
                onClick={() => setPanY((prev) => prev - PAN_STEP)}
                className={styles.panButton}
                title="Mover Arriba"
              >
                <span className={styles.panIcon}>↑</span>
              </button>
              <div className={styles.panHorizontal}>
                <button
                  onClick={() => setPanX((prev) => prev - PAN_STEP)}
                  className={styles.panButton}
                  title="Mover Izquierda"
                >
                  <span className={styles.panIcon}>←</span>
                </button>
                <button
                  onClick={() => setPanX((prev) => prev + PAN_STEP)}
                  className={styles.panButton}
                  title="Mover Derecha"
                >
                  <span className={styles.panIcon}>→</span>
                </button>
              </div>
              <button
                onClick={() => setPanY((prev) => prev + PAN_STEP)}
                className={styles.panButton}
                title="Mover Abajo"
              >
                <span className={styles.panIcon}>↓</span>
              </button>
            </div>
          </div>
        </div>

      {hoveredTrack && (
        <div
          className={styles.tooltip}
          style={{
            left: `${mousePos.x + 10}px`,
            top: `${mousePos.y + 10}px`,
          }}
        >
          {particlesIdentified ? (
            <>
              <h3>{hoveredTrack.name}</h3>
              <p>
                <strong>Tipo:</strong> {hoveredTrack.particleType}
              </p>
              <p>
                <strong>Carga:</strong> {hoveredTrack.charge > 0 ? '+' : hoveredTrack.charge < 0 ? '-' : '0'}
              </p>
              <p>
                <strong>Momento:</strong> {hoveredTrack.momentum.toFixed(2)} GeV/c
              </p>
              {hoveredTrack.description && (
                <p className={styles.description}>{hoveredTrack.description}</p>
              )}
            </>
          ) : (
            <p>Haz clic en "Identificar Partículas" para revelar información de las partículas</p>
          )}
        </div>
      )}

      {/* Botones de acción */}
      <div className={styles.actionButtons}>
        <button 
          onClick={() => {
            setShowForm(true)
          }} 
          className={styles.button}
          disabled={particlesIdentified}
          style={{ 
            opacity: particlesIdentified ? 0.6 : 1,
            cursor: particlesIdentified ? 'not-allowed' : 'pointer'
          }}
        >
          ¡Vamos a Jugar!
        </button>
        <button 
          onClick={() => setParticlesIdentified(true)} 
          className={styles.button}
          disabled={particlesIdentified}
          style={{ 
            opacity: particlesIdentified ? 0.6 : 1,
            cursor: particlesIdentified ? 'not-allowed' : 'pointer'
          }}
        >
          Identificar Partículas
        </button>
      </div>

      {/* Formulario de identificación de partículas */}
      {showForm && (
      <div className={styles.identificationForm}>
        <h2 className={styles.formTitle}>Identificación de Partículas</h2>
        <p className={styles.formDescription}>
          Usa los números en las trayectorias para identificar cada partícula:
        </p>
        <form className={styles.form}>
          {(() => {
            // Find the first electron or positron to show as hint
            let firstElectronOrPositronFound = false
            return Array.from({ length: calculateTotalParticles(tracks) }, (_, i) => i + 1)
              .sort((a, b) => a - b) // Sort by shuffled number
              .map((shuffledNum) => {
              // Get original number from reverse mapping
              const originalNum = reverseMapping[shuffledNum] ?? shuffledNum
              const correctSymbol = getParticleMap(tracks)[originalNum] || ''
              const selectedValue = particleIdentifications[shuffledNum] || ''
              const isElectronOrPositron = correctSymbol === 'e⁻' || correctSymbol === 'e⁺'
              // Only show hint for the FIRST electron or positron
              const showHint = isElectronOrPositron && !firstElectronOrPositronFound
              if (showHint) {
                firstElectronOrPositronFound = true
              }
              // For the first electron/positron, always show correct answer as hint
              const displayValue = showHint ? correctSymbol : selectedValue
              const isCorrect = selectedValue !== '' && selectedValue === correctSymbol
              const isIncorrect = selectedValue !== '' && selectedValue !== correctSymbol
              
              return (
                <div key={shuffledNum} className={styles.formField}>
                  <label htmlFor={`particle-${shuffledNum}`} className={styles.formLabel}>
                    Partícula {shuffledNum}:
                    {(showHint || particlesIdentified) && (
                      <span className={styles.correctAnswer}> ({correctSymbol})</span>
                    )}
                  </label>
                  <select
                    id={`particle-${shuffledNum}`}
                    value={displayValue}
                    onChange={(e) => {
                      if (!showHint) {
                        setParticleIdentifications((prev) => ({
                          ...prev,
                          [shuffledNum]: e.target.value,
                        }))
                      }
                    }}
                    disabled={showHint}
                    className={`${styles.formSelect} ${
                      showHint ? styles.correct : isCorrect ? styles.correct : isIncorrect ? styles.incorrect : ''
                    }`}
                  >
                  <option value="">-- Selecciona una partícula --</option>
                  <option value="p">Protón (p)</option>
                  <option value="π⁺">Pión positivo (π⁺)</option>
                  <option value="π⁻">Pión negativo (π⁻)</option>
                  <option value="π⁰">Pión neutro (π⁰)</option>
                  <option value="μ⁺">Muón positivo (μ⁺)</option>
                  <option value="μ⁻">Muón negativo (μ⁻)</option>
                  <option value="e⁻">Electrón (e⁻)</option>
                  <option value="e⁺">Positrón (e⁺)</option>
                  <option value="γ">Fotón (γ)</option>
                  <option value="n">Neutrón (n)</option>
                  <option value="νμ">Neutrino muónico (νμ)</option>
                  <option value="ν̄μ">Antineutrino muónico (ν̄μ)</option>
                  <option value="νe">Neutrino electrónico (νe)</option>
                  <option value="ν̄e">Antineutrino electrónico (ν̄e)</option>
                  </select>
                </div>
              )
            })
          })()}
          
          {/* Campo para número de neutrinos - solo mostrar si hay neutrinos */}
          {calculateNeutrinoCount(tracks) > 0 && (
            <div className={styles.formField} style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="neutrino-count" className={styles.formLabel}>
                Número de neutrinos emitidos:
                {particlesIdentified && (
                  <span className={styles.correctAnswer}> ({calculateNeutrinoCount(tracks)})</span>
                )}
              </label>
              <select
                id="neutrino-count"
                value={neutrinoCount}
                onChange={(e) => setNeutrinoCount(e.target.value)}
                className={`${styles.formSelect} ${
                  neutrinoCount !== '' && parseInt(neutrinoCount) === calculateNeutrinoCount(tracks)
                    ? styles.correct
                    : neutrinoCount !== '' && parseInt(neutrinoCount) !== calculateNeutrinoCount(tracks)
                    ? styles.incorrect
                    : ''
                }`}
              >
                <option value="">-- Selecciona el número --</option>
                {Array.from({ length: calculateNeutrinoCount(tracks) + 1 }, (_, i) => i).map((num) => (
                  <option key={num} value={num.toString()}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Score display */}
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreLabel}>Mi puntaje: </span>
            <span className={styles.scoreValue}>
              {calculateScore().toFixed(1)}%
            </span>
          </div>
        </form>
      </div>
      )}
    </div>
  )
}

