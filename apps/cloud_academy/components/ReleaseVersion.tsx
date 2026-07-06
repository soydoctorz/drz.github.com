'use client'

import { useState, useEffect } from 'react'

export default function ReleaseVersion() {
  const [releaseVersion, setReleaseVersion] = useState<string>('v1.0.0')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Fetch latest release from GitHub API
    const fetchLatestRelease = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/seap-udea/cloud_academy/releases/latest', {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        })
        
        if (response.ok) {
          const data = await response.json()
          setReleaseVersion(data.tag_name || 'v1.0.0')
        } else {
          // Fallback to package.json version if API fails
          setReleaseVersion('v1.0.0')
        }
      } catch (error) {
        // Fallback to package.json version on error
        setReleaseVersion('v1.0.0')
      } finally {
        setIsLoading(false)
      }
    }

    fetchLatestRelease()
  }, [])

  if (isLoading) {
    return <span style={{ color: '#555' }}>Release v1.0.0</span>
  }

  return (
    <a
      href={`https://github.com/seap-udea/cloud_academy/releases/latest`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: '#555',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = '#4dabf7'}
      onMouseLeave={(e) => e.currentTarget.style.color = '#555'}
    >
      Release {releaseVersion}
    </a>
  )
}

