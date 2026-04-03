import { useEffect, useState } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'

interface SakuraParticlesProps {
  enabled?: boolean
}

export function SakuraParticles({ enabled = true }: SakuraParticlesProps) {
  const [init, setInit] = useState(false)

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine)
    }).then(() => {
      setInit(true)
    })
  }, [])

  if (!enabled || !init) return null

  return (
    <Particles
      id="tsparticles"
      className="fixed inset-0 z-0 pointer-events-none"
      options={{
        background: {
          color: {
            value: 'transparent',
          },
        },
        fpsLimit: 60,
        interactivity: {
          events: {
            onClick: {
              enable: true,
              mode: 'push',
            },
            onHover: {
              enable: true,
              mode: 'repulse',
            },
            resize: {
              enable: true,
            },
          },
          modes: {
            push: {
              quantity: 4,
            },
            repulse: {
              distance: 100,
              duration: 0.4,
            },
          },
        },
        particles: {
          color: {
            value: ['#ffb7c5', '#ff9eaa', '#ffc0cb', '#ffd1dc'],
          },
          links: {
            enable: false,
          },
          move: {
            direction: 'bottom',
            enable: true,
            outModes: {
              default: 'out',
            },
            random: false,
            speed: 2,
            straight: false,
          },
          number: {
            density: {
              enable: true,
              width: 800,
            },
            value: 40,
          },
          opacity: {
            value: { min: 0.3, max: 0.8 },
          },
          shape: {
            type: 'circle',
          },
          size: {
            value: { min: 3, max: 8 },
          },
          rotate: {
            value: {
              min: 0,
              max: 360
            },
            direction: "random",
            move: true,
            animation: {
              enable: true,
              speed: 15
            }
          }
        },
        detectRetina: true,
      }}
    />
  )
}
