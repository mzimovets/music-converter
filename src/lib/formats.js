// Поддерживаемые форматы для конвертации через ffmpeg.wasm
export const FORMATS = [
  {
    id: 'mp3',
    label: 'MP3',
    ext: 'mp3',
    mime: 'audio/mpeg',
    description: 'Универсальный, маленький размер',
    args: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  },
  {
    id: 'wav',
    label: 'WAV',
    ext: 'wav',
    mime: 'audio/wav',
    description: 'Без потерь, для монтажа',
    args: ['-c:a', 'pcm_s16le'],
  },
  {
    id: 'flac',
    label: 'FLAC',
    ext: 'flac',
    mime: 'audio/flac',
    description: 'Без потерь, компактнее WAV',
    args: ['-c:a', 'flac'],
  },
  {
    id: 'ogg',
    label: 'OGG Vorbis',
    ext: 'ogg',
    mime: 'audio/ogg',
    description: 'Открытый формат, хорошее сжатие',
    args: ['-c:a', 'libvorbis', '-q:a', '5'],
  },
  {
    id: 'opus',
    label: 'Opus',
    ext: 'opus',
    mime: 'audio/opus',
    description: 'Лучшее сжатие для голоса и музыки',
    args: ['-c:a', 'libopus', '-b:a', '128k'],
  },
  {
    id: 'aac',
    label: 'AAC (M4A)',
    ext: 'm4a',
    mime: 'audio/mp4',
    description: 'Как в iTunes / Apple Music',
    args: ['-c:a', 'aac', '-b:a', '192k'],
  },
  {
    id: 'alac',
    label: 'ALAC',
    ext: 'm4a',
    mime: 'audio/mp4',
    description: 'Apple Lossless, без потерь',
    args: ['-c:a', 'alac'],
  },
  {
    id: 'wma',
    label: 'WMA',
    ext: 'wma',
    mime: 'audio/x-ms-wma',
    description: 'Для старых Windows-плееров',
    args: ['-c:a', 'wmav2', '-b:a', '192k'],
  },
  {
    id: 'aiff',
    label: 'AIFF',
    ext: 'aiff',
    mime: 'audio/aiff',
    description: 'Без потерь, стандарт Apple',
    args: ['-c:a', 'pcm_s16be'],
  },
  {
    id: 'ac3',
    label: 'AC3',
    ext: 'ac3',
    mime: 'audio/ac3',
    description: 'Dolby Digital, для ТВ и ресиверов',
    args: ['-c:a', 'ac3', '-b:a', '192k'],
  },
]

const EXT_TO_FORMAT_ID = {
  mp3: 'mp3',
  wav: 'wav',
  wave: 'wav',
  flac: 'flac',
  ogg: 'ogg',
  oga: 'ogg',
  opus: 'opus',
  aac: 'aac',
  m4a: 'aac',
  m4b: 'aac',
  wma: 'wma',
  aiff: 'aiff',
  aif: 'aiff',
  amr: 'amr',
  weba: 'opus',
  webm: 'opus',
  mp4: 'aac',
  ac3: 'ac3',
  alac: 'alac',
}

const MIME_TO_FORMAT_ID = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/mp4': 'aac',
  'audio/x-m4a': 'aac',
  'audio/webm': 'opus',
}

export function getExtension(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename || '')
  return match ? match[1].toLowerCase() : ''
}

// Определяет исходный формат файла по расширению и mime-типу
export function detectFormat(file) {
  const ext = getExtension(file.name)
  const byExt = EXT_TO_FORMAT_ID[ext]
  const byMime = MIME_TO_FORMAT_ID[file.type]
  const id = byExt || byMime || null
  const known = FORMATS.find((f) => f.id === id)
  return {
    ext: ext || (known ? known.ext : ''),
    id: id,
    label: known ? known.label : ext ? ext.toUpperCase() : 'Аудио',
    isKnownTarget: Boolean(known),
  }
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} Б`
  const units = ['КБ', 'МБ', 'ГБ']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function sanitizeFileName(name) {
  return (name || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .slice(0, 120) || 'audio'
}
