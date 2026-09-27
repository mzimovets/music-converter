import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import Icon from './Icon'
import { formatTime, formatTimePrecise, parseTimeInput } from '../lib/formats'

// Волна с перетаскиваемой областью обрезки (wavesurfer.js + regions plugin)
export default function WaveformTrimmer({ url, initialStart, initialEnd, onChange }) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const regionRef = useRef(null)
  const commitEditRef = useRef(null)
  const seekAndPlayRef = useRef(null)
  const [range, setRange] = useState({ start: initialStart ?? 0, end: initialEnd ?? 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const startFocusedRef = useRef(false)
  const endFocusedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || !url) return
    setIsReady(false)

    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'color-mix(in oklch, var(--foreground) 35%, transparent)',
      progressColor: 'var(--accent)',
      // Родной курсор wavesurfer — он рисуется той же canvas-системой координат,
      // что и волна/регион, поэтому не может разъехаться с масштабом/прокруткой,
      // в отличие от отдельного DOM-оверлея с ручным пересчётом пикселей.
      cursorColor: 'rgba(255, 255, 255, 0.9)',
      cursorWidth: 2,
      autoScroll: true,
      autoCenter: false,
      height: 72,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      url,
      // Клик/драг по самой волне по умолчанию сам перематывает воспроизведение
      // в произвольную точку — мимо выделения. Отключаем: вся навигация должна
      // идти только через ручки региона, иначе лёгкий промах пальцем мимо
      // тонкой ручки (особенно после авто-зума) уводит звук куда попало.
      interact: false,
      plugins: [regions],
    })
    wsRef.current = ws

    // Играем и останавливаемся напрямую через нативный <audio>-элемент, а не
    // через ws.play(start, end): у него асинхронный stopAtPosition, и при частых
    // повторных вызовах (быстрый драг) промисы могут резолвиться не по порядку —
    // более старый вызов перезаписывает границу более свежего (race condition,
    // именно из-за неё воспроизведение иногда проскакивало мимо выделения).
    // Родной timeupdate у медиаэлемента — единственный источник истины для
    // остановки, и он же надёжнее на iOS Safari, где rAF может притормаживать.
    const getMedia = () => ws.getMediaElement()
    const seekAndPlay = (from) => {
      const media = getMedia()
      if (!media) return
      media.currentTime = from
      media.play().catch(() => {})
    }
    seekAndPlayRef.current = seekAndPlay
    const nativeGuard = () => {
      const media = getMedia()
      const region = regionRef.current
      if (!media || !region) return
      if (!media.paused && media.currentTime >= region.end - 0.03) {
        media.pause()
        media.currentTime = region.end
      }
    }
    getMedia()?.addEventListener('timeupdate', nativeGuard)

    // Масштабирует и центрирует волну на выделенном отрезке — подробнее видно, во что превращается обрезка
    const zoomToRegion = (region) => {
      const container = containerRef.current
      const dur = ws.getDuration()
      if (!container || !dur) return
      const width = container.clientWidth || 1
      const regionDur = Math.max(0.05, region.end - region.start)
      const fitPxPerSec = width / dur
      const targetPxPerSec = (width * 0.65) / regionDur
      const pxPerSec = Math.min(Math.max(targetPxPerSec, fitPxPerSec), 1000)
      ws.zoom(pxPerSec)
      const center = (region.start + region.end) / 2
      ws.setScroll(Math.max(0, center * pxPerSec - width / 2))
    }

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
      setStartText(formatTimePrecise(region.start))
      setEndText(formatTimePrecise(region.end))
      onChange?.({ start: region.start, end: region.end, duration: dur })
      const media = getMedia()
      if (media) media.currentTime = region.start
      setIsReady(true)
    })

    const commitRange = (region) => {
      setRange({ start: region.start, end: region.end })
      if (!startFocusedRef.current) setStartText(formatTimePrecise(region.start))
      if (!endFocusedRef.current) setEndText(formatTimePrecise(region.end))
      onChange?.({ start: region.start, end: region.end, duration: ws.getDuration() })
    }
    // Пока тянут ползунок — сразу проигрываем звук с этой точки (скраб-прослушивание).
    // Без троттлинга: звук должен точно следовать за нарисованной границей на
    // каждый тик, иначе реальная позиция отстаёт от того, что нарисовано.
    const scrubOnDrag = (region, side) => {
      commitRange(region)
      const from = side === 'end' ? Math.max(region.start, region.end - 1.2) : region.start
      seekAndPlay(from)
    }
    regions.on('region-update', scrubOnDrag)
    regions.on('region-updated', (region) => {
      commitRange(region)
      zoomToRegion(region)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))

    // Точный ввод времени в полях мм:сс.мс
    commitEditRef.current = (field, seconds) => {
      const region = regionRef.current
      if (!region || !Number.isFinite(seconds)) return
      const dur = ws.getDuration()
      let { start, end } = region
      if (field === 'start') start = Math.min(Math.max(0, seconds), end - 0.05)
      else end = Math.max(Math.min(dur, seconds), start + 0.05)
      region.setOptions({ start, end })
      commitRange(region)
      zoomToRegion(region)
      // Правка полей не двигает курсор воспроизведения сама по себе (в отличие
      // от драга) — переносим его на новое начало, иначе белая линия остаётся
      // там, где было предыдущее воспроизведение, вне только что заданного диапазона
      const media = getMedia()
      if (media) media.currentTime = start
    }

    return () => {
      getMedia()?.removeEventListener('timeupdate', nativeGuard)
      ws.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const togglePreview = () => {
    const region = regionRef.current
    if (!region) return
    if (isPlaying) {
      wsRef.current?.getMediaElement()?.pause()
    } else {
      seekAndPlayRef.current?.(region.start)
    }
  }

  const restartPreview = () => {
    const region = regionRef.current
    if (!region) return
    seekAndPlayRef.current?.(region.start)
  }

  const handleTimeBlur = (field) => (e) => {
    if (field === 'start') startFocusedRef.current = false
    else endFocusedRef.current = false
    const seconds = parseTimeInput(e.target.value)
    if (seconds === null) {
      // некорректный ввод — откатываем к текущему значению
      if (field === 'start') setStartText(formatTimePrecise(range.start))
      else setEndText(formatTimePrecise(range.end))
      return
    }
    commitEditRef.current?.(field, seconds)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="wf-container relative rounded-xl overflow-hidden bg-[var(--surface-tertiary)] px-1"
        style={{ touchAction: 'none' }}
      >
        <div ref={containerRef} className="w-full" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
            Строим волну…
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePreview}
            disabled={!isReady}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-[var(--surface-secondary)] text-[var(--foreground)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-soft-foreground)] transition-colors disabled:opacity-50"
          >
            <Icon name={isPlaying ? 'pause' : 'play'} className="w-3.5 h-3.5" />
            {isPlaying ? 'Стоп' : 'Прослушать выделенное'}
          </button>
          <button
            type="button"
            onClick={restartPreview}
            disabled={!isReady}
            aria-label="Начать сначала"
            title="Начать сначала"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-soft-foreground)] transition-colors disabled:opacity-50"
          >
            <Icon name="refresh" className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="tabular-nums">
          длительность {formatTime(Math.max(0, range.end - range.start))}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[var(--muted)] shrink-0">Начало</span>
          <input
            type="text"
            inputMode="decimal"
            value={startText}
            disabled={!isReady}
            onFocus={() => {
              startFocusedRef.current = true
            }}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={handleTimeBlur('start')}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full min-w-0 rounded-lg px-2 py-1.5 bg-[var(--surface-secondary)] text-[var(--foreground)] tabular-nums border border-transparent focus:border-[var(--accent)] outline-none disabled:opacity-50"
            placeholder="0:00.000"
          />
        </label>
        <label className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[var(--muted)] shrink-0">Конец</span>
          <input
            type="text"
            inputMode="decimal"
            value={endText}
            disabled={!isReady}
            onFocus={() => {
              endFocusedRef.current = true
            }}
            onChange={(e) => setEndText(e.target.value)}
            onBlur={handleTimeBlur('end')}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full min-w-0 rounded-lg px-2 py-1.5 bg-[var(--surface-secondary)] text-[var(--foreground)] tabular-nums border border-transparent focus:border-[var(--accent)] outline-none disabled:opacity-50"
            placeholder="0:00.000"
          />
        </label>
      </div>
    </div>
  )
}
