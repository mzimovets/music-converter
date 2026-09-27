import { FFmpeg } from '@ffmpeg/ffmpeg'

const CORE_BASE = `${import.meta.env.BASE_URL}ffmpeg`

let ffmpegInstance = null
let loadPromise = null

// Скачивает файл и сообщает прогресс по заголовку Content-Length,
// возвращая blob: URL для передачи в ffmpeg.load()
async function fetchAsBlobUrlWithProgress(url, mimeType, onProgress) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось загрузить ${url}`)
  }
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total > 0) onProgress?.(received / total)
  }

  onProgress?.(1)
  const blob = new Blob(chunks, { type: mimeType })
  return URL.createObjectURL(blob)
}

// Загружает движок ffmpeg.wasm один раз; вызывает onProgress(0..1) во время загрузки .wasm
export function loadFFmpeg(onProgress) {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance)
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()

    const [coreURL, wasmURL] = await Promise.all([
      fetchAsBlobUrlWithProgress(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', () => {}),
      fetchAsBlobUrlWithProgress(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', onProgress),
    ])

    await ffmpeg.load({ coreURL, wasmURL })
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

// Конвертирует файл в целевой формат, сообщая прогресс кодирования (0..1)
// trim (необязательно): { start, duration } в секундах — обрезка перед конвертацией
export async function convertAudio(file, targetFormat, { onEngineProgress, onConvertProgress, trim } = {}) {
  const ffmpeg = await loadFFmpeg(onEngineProgress)

  const inputName = `input.${(file.name.split('.').pop() || 'bin').toLowerCase()}`
  const outputName = `output.${targetFormat.ext}`

  const progressHandler = ({ progress }) => {
    if (Number.isFinite(progress)) {
      onConvertProgress?.(Math.min(Math.max(progress, 0), 1))
    }
  }
  ffmpeg.on('progress', progressHandler)

  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    await ffmpeg.writeFile(inputName, buffer)

    const args = []
    if (trim) args.push('-ss', String(trim.start))
    args.push('-i', inputName)
    if (trim) args.push('-t', String(trim.duration))
    args.push(...targetFormat.args, outputName)

    await ffmpeg.exec(args)
    const data = await ffmpeg.readFile(outputName)
    onConvertProgress?.(1)
    return new Blob([data.buffer], { type: targetFormat.mime })
  } finally {
    ffmpeg.off('progress', progressHandler)
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}
