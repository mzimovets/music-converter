# Audio Converter

Конвертация аудиофайлов прямо в браузере: определяет формат исходного файла,
даёт выбрать целевой формат, показывает прогресс конвертации и позволяет
переименовать файл перед скачиванием. Есть опциональная обрезка (waveform +
перетаскиваемые ползунки) перед конвертацией. Работает как PWA — можно
установить на телефон/компьютер и пользоваться офлайн.

Вся обработка происходит локально на устройстве пользователя (ffmpeg.wasm) —
файлы никуда не отправляются.

## Стек

- React 19 + Vite
- Tailwind CSS v4 + HeroUI v3
- ffmpeg.wasm (`@ffmpeg/ffmpeg`) для конвертации
- wavesurfer.js для визуализации волны и обрезки
- vite-plugin-pwa

## Разработка

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
```

## Деплой на GitHub Pages

Сборка кладётся в папку `docs/` (см. `build.outDir` в `vite.config.js`).
После изменений выполните:

```bash
npm run build
git add docs
git commit -m "Обновить сборку"
git push
```

В настройках репозитория один раз включите: **Settings → Pages → Build and
deployment → Source: Deploy from a branch → Branch: `main` / `docs`**.
