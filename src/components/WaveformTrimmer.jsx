import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import Icon from './Icon'
import { formatTime } from '../lib/formats'

// Волна с перетаскиваемой областью обрезки (wavesurfer.js + regions plugin)
export default function WaveformTrimmer({ url, initialStart, initialEnd, onChange }) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const regionRef = useRef(null)
  const [range, setRange] = useState({ start: initialStart ?? 0, end: initialEnd ?? 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !url) return
    setIsReady(false)

    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'color-mix(in oklch, var(--foreground) 35%, transparent)',
      progressColor: 'var(--accent)',
      cursorColor: 'transparent',
      height: 72,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      url,
      plugins: [regions],
    })
    wsRef.current = ws

    ws.on('decode', () => {
      const dur = ws.getDuration()
      const region = regions.addRegion({
        start: initialStart ?? 0,
        end: initialEnd && initialEnd > 0 ? initialEnd : dur,
        color: 'color-mix(in oklch, var(--accent) 30%, transparent)',
        drag: true,
        resize: true,
        minLength: Math.min(0.5, dur),
      })
      regionRef.current = region
      setRange({ start: region.start, end: region.end })
      onChange?.({ start: region.start, end: region.end, duration: dur })
      setIsReady(true)
    })

    const handleUpdate = (region) => {
      setRange({ start: region.start, end: region.end })
      onChange?.({ start: region.start, end: region.end, duration: ws.getDuration() })
    }
    regions.on('region-updated', handleUpdate)
    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))

    return () => {
      ws.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const togglePreview = () => {
    if (!regionRef.current) return
    if (isPlaying) {
      wsRef.current?.pause()
    } else {
      regionRef.current.play(true)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-xl overflow-hidden bg-[var(--surface-tertiary)] px-1">
        <div ref={containerRef} className="w-full" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            Строим волну…
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <button
          type="button"
          onClick={togglePreview}
          disabled={!isReady}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-[var(--surface-secondary)] text-[var(--foreground)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-soft-foreground)] transition-colors disabled:opacity-50"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} className="w-3.5 h-3.5" />
          {isPlaying ? 'Стоп' : 'Прослушать выделенное'}
        </button>
        <span className="tabular-nums">
          {formatTime(range.start)} – {formatTime(range.end)} · длительность{' '}
          {formatTime(Math.max(0, range.end - range.start))}
        </span>
      </div>
    </div>
  )
}
