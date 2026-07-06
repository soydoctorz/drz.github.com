export interface ProjectileConfig {
  id: string
  name: string
  description: string
  particleType: 'proton' | 'neutron' | 'electron' | 'pion' | 'kaon' | 'muon' | 'photon'
  charge: number
  mass: number // Relative mass (proton = 1)
  color: string
  symbol: string
}

export const PROJECTILE_CONFIGS: ProjectileConfig[] = [
  {
    id: 'proton-1',
    name: 'Protón como proyectil',
    description: 'Colisión protón-protón con producción de piones',
    particleType: 'proton',
    charge: 1,
    mass: 1,
    color: '#845ef7',
    symbol: 'p',
  },
  {
    id: 'neutron',
    name: 'Neutrón en la cámara',
    description: 'Neutrón que se desintegra en electrón, protón y neutrino',
    particleType: 'neutron',
    charge: 0,
    mass: 1,
    color: '#94d2ff',
    symbol: 'n',
  },
  {
    id: 'photon',
    name: 'Fotón en la cámara',
    description: 'Fotón que produce un par electrón-positrón',
    particleType: 'photon',
    charge: 0,
    mass: 0,
    color: '#cccccc',
    symbol: 'γ',
  },
  {
    id: 'muon',
    name: 'Muón en la cámara',
    description: 'Muón que se desintegra en electrón/positrón y dos neutrinos',
    particleType: 'muon',
    charge: 0, // Will be randomly assigned
    mass: 0.1, // Muon mass relative to proton
    color: '#4dabf7',
    symbol: 'μ',
  },
  {
    id: 'pion',
    name: 'Pión en la cámara',
    description: 'Pión que se desintegra en muón y luego en electrón/positrón y neutrinos',
    particleType: 'pion',
    charge: 0, // Will be randomly assigned (-1, 0, or 1)
    mass: 0.15, // Pion mass relative to proton
    color: '#51cf66',
    symbol: 'π',
  },
  // Placeholder para futuros proyectiles
  // {
  //   id: 'electron',
  //   name: 'Electrón como proyectil',
  //   description: 'Colisión electrón-protón',
  //   particleType: 'electron',
  //   charge: -1,
  //   mass: 0.0005,
  //   color: '#ffd43b',
  //   symbol: 'e⁻',
  // },
]

export function getProjectileConfig(id: string): ProjectileConfig | undefined {
  return PROJECTILE_CONFIGS.find(config => config.id === id)
}

export function getDefaultProjectileConfig(): ProjectileConfig {
  return PROJECTILE_CONFIGS[0]
}

