'use client'

import Image from 'next/image'
import BubbleChamber from '@/components/BubbleChamber'
import ReleaseVersion from '@/components/ReleaseVersion'

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', padding: '2rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <Image 
              src="/drz.webp" 
              alt="Doctor Z Logo" 
              width={80} 
              height={80}
              style={{ objectFit: 'contain', marginBottom: '0.5rem' }}
            />
            <h1 style={{ fontSize: '2.5rem', margin: 0, color: '#ffffff' }}>
              Cloud Academy
            </h1>
          </div>
          <p style={{ fontSize: '1.1rem', color: '#b0b0b0', marginBottom: '1rem' }}>
            Visualización interactiva de las trazas en una cámara de burbujas
          </p>
        </header>
        <BubbleChamber />
        <footer style={{ 
          marginTop: '2rem', 
          textAlign: 'center', 
          fontSize: '0.75rem', 
          color: '#666', 
          fontStyle: 'italic' 
        }}>
          Desarrollado en Cursor por Jorge I. Zuluaga, Doctor Z (2025)
          <br />
          <a 
            href="https://github.com/seap-udea/cloud_academy" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              color: '#888', 
              textDecoration: 'none',
              marginLeft: '0.5rem',
              marginRight: '0.5rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#4dabf7'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
          >
            GitHub
          </a>
          <span style={{ color: '#555', marginLeft: '0.5rem', marginRight: '0.5rem' }}>|</span>
          <ReleaseVersion />
        </footer>
      </div>
    </main>
  )
}

