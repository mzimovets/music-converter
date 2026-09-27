import { useRef, useState } from 'react'
import Icon from './Icon'
import { formatTime } from '../lib/formats'

// Простой плеер для прослушивания исходного файла целиком (когда обрезка выключена)
export default function AudioPlayer({ url }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  const onSeek = (e) => {
    const audio = audioRef.current
    const t = Number(e.target.value)
    setCurrentTime(t)
    if (audio) audio.currentTime = t
  }

  return (
    <div className="flex items-center gap-3 rounded-xl p-3 bg-[var(--surface-secondary)]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Пауза' : 'Слушать'}
        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
      >
        <Icon name={isPlaying ? 'pause' : 'play'} className="w-4 h-4" />
      </button>
      <span className="text-xs text-[var(--muted)] tabular-nums w-10 shrink-0 text-right">
        {formatTime(currentTime)}
      </span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(currentTime, duration || 0)}
        onChange={onSeek}
        className="flex-1 min-w-0 cursor-pointer"
        style={{ accentColor: 'var(--accent)' }}
      />
      <span className="text-xs text-[var(--muted)] tabular-nums w-10 shrink-0">
        -{formatTime(Math.max(0, duration - currentTime))}
      </span>
    </div>
  )
}
