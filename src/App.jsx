import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, ProgressBar, Input } from '@heroui/react'
import Icon from './components/Icon'
import WaveformTrimmer from './components/WaveformTrimmer'
import { FORMATS, detectFormat, formatBytes, sanitizeFileName } from './lib/formats'
import { convertAudio } from './lib/ffmpeg'

const STAGE = {
  IDLE: 'idle',
  READY: 'ready',
  LOADING_ENGINE: 'loading-engine',
  CONVERTING: 'converting',
  DONE: 'done',
  ERROR: 'error',
}

function isProbablyAudio(file) {
  if (!file) return false
  if (file.type?.startsWith('audio/')) return true
  return Boolean(detectFormat(file).ext)
}

export default function App() {
  const [stage, setStage] = useState(STAGE.IDLE)
  const [file, setFile] = useState(null)
  const [sourceFormat, setSourceFormat] = useState(null)
  const [targetId, setTargetId] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [engineProgress, setEngineProgress] = useState(0)
  const [convertProgress, setConvertProgress] = useState(0)
  const [resultBlob, setResultBlob] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(null)

  const [trimEnabled, setTrimEnabled] = useState(false)
  const [trimRange, setTrimRange] = useState(null)
  const [sourceUrl, setSourceUrl] = useState(null)

  const fileInputRef = useRef(null)
  const engineLoadedRef = useRef(false)
  const resultUrlRef = useRef(null)

  const targetFormat = useMemo(() => FORMATS.find((f) => f.id === targetId) || null, [targetId])
  const availableFormats = useMemo(
    () => FORMATS.filter((f) => f.id !== sourceFormat?.id),
    [sourceFormat],
  )

  const resetAll = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    setStage(STAGE.IDLE)
    setFile(null)
    setSourceFormat(null)
    setTargetId(null)
    setEngineProgress(0)
    setConvertProgress(0)
    setResultBlob(null)
    setFileName('')
    setError(null)
    setTrimEnabled(false)
    setTrimRange(null)
    setSourceUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [sourceUrl])

  const onFileChosen = useCallback((chosen) => {
    if (!chosen || !isProbablyAudio(chosen)) {
      setError('Это не похоже на аудиофайл. Попробуйте другой файл.')
      setStage(STAGE.ERROR)
      return
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    const detected = detectFormat(chosen)
    setFile(chosen)
    setSourceFormat(detected)
    setTargetId(null)
    setResultBlob(null)
    setError(null)
    setTrimEnabled(false)
    setTrimRange(null)
    const base = chosen.name.replace(/\.[^./]+$/, '')
    setFileName(base || 'audio')
    setStage(STAGE.READY)
    setSourceUrl(URL.createObjectURL(chosen))
  }, [sourceUrl])

  const handleInputChange = (e) => {
    const chosen = e.target.files?.[0]
    onFileChosen(chosen)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const dropped = e.dataTransfer.files?.[0]
    onFileChosen(dropped)
  }

  // Вставка файла из буфера обмена по кнопке (для телефонов, где нет Ctrl+V)
  const handlePasteButton = async () => {
    if (!navigator.clipboard?.read) {
      setError('Ваш браузер не поддерживает вставку из буфера. Выберите файл вручную.')
      setStage(STAGE.ERROR)
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('audio/'))
        if (type) {
          const blob = await item.getType(type)
          const ext = type.split('/')[1]?.split(';')[0] || 'bin'
          onFileChosen(new File([blob], `clipboard-audio.${ext}`, { type }))
          return
        }
      }
      setError('В буфере обмена нет аудиофайла. Скопируйте файл и попробуйте снова.')
      setStage(STAGE.ERROR)
    } catch {
      setError('Не удалось получить доступ к буферу обмена. Разрешите доступ или выберите файл вручную.')
      setStage(STAGE.ERROR)
    }
  }

  // Вставка файла из буфера обмена (Ctrl+V)
  useEffect(() => {
    const onPaste = (e) => {
      if (stage === STAGE.CONVERTING || stage === STAGE.LOADING_ENGINE) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.kind === 'file') {
          const pasted = item.getAsFile()
          if (pasted) {
            e.preventDefault()
            onFileChosen(pasted)
            break
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [stage, onFileChosen])

  useEffect(() => () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConvert = useCallback(async () => {
    if (!file || !targetFormat) return
    setError(null)
    setConvertProgress(0)
    setStage(engineLoadedRef.current ? STAGE.CONVERTING : STAGE.LOADING_ENGINE)
    setEngineProgress(0)

    const shouldTrim =
      trimEnabled &&
      trimRange &&
      (trimRange.start > 0.05 || trimRange.end < trimRange.duration - 0.05)

    try {
      const blob = await convertAudio(file, targetFormat, {
        onEngineProgress: (p) => {
          setEngineProgress(p)
          if (p >= 1 && !engineLoadedRef.current) {
            engineLoadedRef.current = true
            setStage(STAGE.CONVERTING)
          }
        },
        onConvertProgress: (p) => setConvertProgress(p),
        trim: shouldTrim ? { start: trimRange.start, duration: trimRange.end - trimRange.start } : undefined,
      })
      engineLoadedRef.current = true
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = URL.createObjectURL(blob)
      setResultBlob(blob)
      setStage(STAGE.DONE)
    } catch (err) {
      console.error(err)
      setError('Не получилось сконвертировать файл. Попробуйте другой формат или файл.')
      setStage(STAGE.ERROR)
    }
  }, [file, targetFormat, trimEnabled, trimRange])

  const handleDownload = () => {
    if (!resultUrlRef.current || !targetFormat) return
    const a = document.createElement('a')
    a.href = resultUrlRef.current
    a.download = `${sanitizeFileName(fileName)}.${targetFormat.ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const openFilePicker = () => fileInputRef.current?.click()

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-10 sm:py-16">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleInputChange}
      />

      <header className="flex flex-col items-center gap-4 mb-10 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg animate-float-note"
          style={{
            background: 'linear-gradient(135deg, oklch(0.56 0.2 18), oklch(0.32 0.14 15))',
          }}
        >
          <Icon name="music-notes" className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--foreground)]">
            Audio Converter
          </h1>
          <p className="mt-2 text-[var(--muted)] max-w-md">
            Конвертируйте аудио прямо в браузере — без загрузки на сервер. Быстро и приватно.
          </p>
        </div>
      </header>

      <Card
        variant="default"
        className="w-full max-w-xl backdrop-blur-xl border border-[var(--border)]"
        style={{ background: 'color-mix(in oklch, var(--surface) 92%, transparent)' }}
      >
        <Card.Content className="p-6 sm:p-8 flex flex-col gap-6">
          {stage === STAGE.IDLE && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={openFilePicker}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openFilePicker()}
              className={`animate-pop-in rounded-2xl border-2 border-dashed p-10 sm:p-14 flex flex-col items-center gap-4 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'dropzone-active border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon name="upload" className="w-7 h-7" />
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">
                  Перетащите аудиофайл сюда
                </p>
                <p className="text-sm text-[var(--muted)] mt-1">
                  или нажмите, чтобы выбрать · или Ctrl+V, чтобы вставить
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePasteButton()
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-[var(--surface-secondary)] text-[var(--foreground)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-soft-foreground)] transition-colors"
              >
                <Icon name="upload-square" className="w-4 h-4" />
                Вставить из буфера обмена
              </button>
            </div>
          )}

          {file && stage !== STAGE.IDLE && (
            <div className="animate-pop-in flex items-center gap-3 rounded-xl p-4 bg-[var(--surface-secondary)]">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Icon name="music-note" className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium text-[var(--foreground)]">{file.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {formatBytes(file.size)} · {sourceFormat?.label}
                </p>
              </div>
              {(stage === STAGE.READY || stage === STAGE.ERROR) && (
                <button
                  type="button"
                  onClick={resetAll}
                  aria-label="Убрать файл"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors shrink-0"
                >
                  <Icon name="trash-bin-trash" className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {stage === STAGE.READY && (
            <div className="animate-pop-in flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setTrimEnabled((v) => !v)}
                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 transition-colors overflow-hidden ${
                  trimEnabled
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 text-sm font-medium text-[var(--foreground)]">
                  <Icon name="video-frame-cut-2" className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span className="min-w-0">Обрезать аудио перед конвертацией</span>
                </span>
                <span
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                    trimEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--default)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      trimEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>

              {trimEnabled && sourceUrl && (
                <div className="animate-pop-in">
                  <WaveformTrimmer
                    url={sourceUrl}
                    initialStart={trimRange?.start}
                    initialEnd={trimRange?.end}
                    onChange={setTrimRange}
                  />
                </div>
              )}

              <p className="text-sm font-medium text-[var(--foreground)]">Конвертировать в:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableFormats.map((f) => {
                  const selected = f.id === targetId
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setTargetId(f.id)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent)]'
                          : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <p
                        className={`font-semibold text-sm ${selected ? 'text-[var(--accent-soft-foreground)]' : 'text-[var(--foreground)]'}`}
                      >
                        {f.label}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5 leading-snug">
                        {f.description}
                      </p>
                    </button>
                  )
                })}
              </div>

              <Button
                variant="primary"
                fullWidth
                isDisabled={!targetId}
                onClick={handleConvert}
                className="mt-2"
              >
                <Icon name="round-transfer-horizontal" className="w-4 h-4" />
                Конвертировать
              </Button>
            </div>
          )}

          {(stage === STAGE.LOADING_ENGINE || stage === STAGE.CONVERTING) && (
            <div className="animate-pop-in flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[var(--foreground)]">
                  {stage === STAGE.LOADING_ENGINE
                    ? 'Загрузка движка конвертации…'
                    : `Конвертация в ${targetFormat?.label}…`}
                </span>
                <span className="text-[var(--muted)] tabular-nums">
                  {Math.round((stage === STAGE.LOADING_ENGINE ? engineProgress : convertProgress) * 100)}%
                </span>
              </div>
              <ProgressBar
                value={(stage === STAGE.LOADING_ENGINE ? engineProgress : convertProgress) * 100}
                color="accent"
              >
                <ProgressBar.Track className="h-2.5 rounded-full overflow-hidden relative">
                  <ProgressBar.Fill className="rounded-full" />
                </ProgressBar.Track>
              </ProgressBar>
              {stage === STAGE.LOADING_ENGINE && (
                <p className="text-xs text-[var(--muted)]">
                  Загружается один раз (~30 МБ) и кэшируется в браузере
                </p>
              )}
            </div>
          )}

          {stage === STAGE.DONE && (
            <div className="animate-pop-in flex flex-col gap-4">
              <div className="flex items-center gap-2 text-[var(--success)]">
                <Icon name="verified-check" className="w-5 h-5" />
                <span className="font-medium">Готово! Файл сконвертирован в {targetFormat?.label}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--foreground)]" htmlFor="filename">
                  Имя файла
                </label>
                <div className="flex items-stretch gap-2">
                  <div className="relative flex-1">
                    <Icon
                      name="pen-2"
                      className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
                    />
                    <Input
                      id="filename"
                      aria-label="Имя файла"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      fullWidth
                      className="pl-9"
                    />
                  </div>
                  <span className="flex items-center px-3 rounded-[var(--field-radius)] bg-[var(--surface-secondary)] text-[var(--muted)] text-sm whitespace-nowrap">
                    .{targetFormat?.ext}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="primary" fullWidth onClick={handleDownload}>
                  <Icon name="file-download" className="w-4 h-4" />
                  Скачать
                </Button>
                <Button variant="outline" fullWidth onClick={resetAll}>
                  Конвертировать другой файл
                </Button>
              </div>
            </div>
          )}

          {stage === STAGE.ERROR && (
            <div className="animate-pop-in flex flex-col gap-4">
              <p className="text-sm text-[var(--danger)]">{error}</p>
              <Button variant="outline" fullWidth onClick={resetAll}>
                Попробовать снова
              </Button>
            </div>
          )}
        </Card.Content>
      </Card>

      <footer className="mt-10 text-xs text-[var(--muted)] text-center max-w-md">
        Вся конвертация происходит локально на вашем устройстве — файлы никуда не отправляются.
      </footer>
    </div>
  )
}
