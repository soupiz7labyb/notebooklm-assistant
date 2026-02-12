# NotebookLM Assistant — Полное описание UI

Этот документ описывает весь интерфейс расширения **NotebookLM Assistant** (side panel), чтобы его можно было загрузить в NotebookLM и использовать как основу для краткого визуального гайда.

## 1) Общая структура интерфейса

- Формат: вертикальная боковая панель браузера (Chrome Side Panel).
- Корневой layout: `Header` сверху + прокручиваемая основная часть + toast-уведомления.
- Основные блоки в авторизованном режиме:
  1. `MainContent` (добавление контента)
  2. `QueueList` (очередь загрузок)
  3. `SourcesList` (источники текущего notebook + экспорт)
- В неавторизованном режиме вместо контента показывается экран входа (`AuthScreen`).

## 2) Визуальный стиль

- Технология UI: React + Tailwind + shadcn/ui-подобные компоненты.
- Светлая тема по умолчанию, поддерживаются токены для dark mode.
- Базовые особенности:
  - Закругленные карточки (`rounded-lg`)
  - Нейтральные рамки (`border-border`)
  - Акцентные кнопки для основных действий
  - Маленькие иконки `lucide-react`
  - Компактная плотность элементов (под side panel)
- Основные визуальные индикаторы:
  - Зеленый: успех/готово
  - Желтый: процесс/загрузка
  - Красный: ошибка/удаление

## 3) Экран входа (`AuthScreen`)

### Что видит пользователь

- Заголовок: **Welcome to NotebookLM Assistant**
- Подзаголовок: предложение войти через Google
- Крупная кнопка: **Sign in with Google**
- 2 текстовых подсказки снизу:
  - Нужно быть залогиненным в `notebooklm.google.com`
  - OAuth ошибки можно игнорировать (работа через cookies возможна)

### Состояния

- Нормальное: кнопка активна.
- При попытке входа: глобальное loading-состояние (через store), после результата показывается toast:
  - Success: `Authenticated successfully`
  - Error: `Authentication Error` + текст ошибки

## 4) Header (верхняя панель)

## Состав

- Лого-блок: квадрат с буквой `N` + заголовок **NotebookLM Assistant**
- Статус-точка справа от названия:
  - Красная: не авторизован
  - Желтая: идет загрузка/обновление
  - Зеленая: готово

### Контролы (если авторизован)

- Выпадающий список notebook'ов (`Select notebook`)
- Кнопка переименования текущего notebook (иконка карандаша `✏️`, через `prompt`)
- Кнопка создания notebook (иконка `+`, при загрузке спиннер)
- Кнопка обновления списка notebook'ов (иконка refresh, при загрузке вращается)
- Кнопка logout (иконка выхода)
- Кнопка Donate (сердце) всегда справа

### Donate dropdown

- Заголовок: `Donate to the project`
- Пункты адресов:
  - USDT Tron
  - USDT Ethereum
  - USDC Ethereum
- Клик по пункту копирует адрес в буфер; показывается toast `Copied!`

## 5) MainContent (основные действия)

Если notebook не выбран: сообщение **Please select or create a notebook**.

### 5.1 Кнопка Add Current Page

- Крупная primary-кнопка с иконкой глобуса.
- Поведение:
  - Обычная страница: парсит и отправляет как source.
  - YouTube:
    - Канал (`/@...`, `/channel/`, `/c/`) — добавляется URL канала напрямую.
    - Видео/плейлист — открывается `YouTubeOptionsDialog`.
- Успех: toast `Added to queue`.
- Ошибка: toast `Error`.

### 5.2 Блок Quick Note

- Карточка с иконкой `Type` и заголовком **Quick Note**
- Поля:
  - `Note title...` (Input)
  - `Enter your note here...` (Textarea, 4 строки)
- Кнопка: **Add Note**
- Валидация: обязательны и заголовок, и текст.

### 5.3 Блок File Upload (drag & drop)

- Пунктирная зона загрузки с иконкой Upload.
- Текст:
  - `Drag & drop files here, or click to select`
  - список поддерживаемых форматов
- Кнопка: **Select Files** (открывает скрытый `<input type="file" multiple>`)
- Визуальная реакция при drag over: усиленный акцентный бордер + легкая подложка.

### Поддерживаемые форматы

- Текстовые/документы: `pdf, txt, md, markdown, docx, csv`
- Изображения: `png, jpg, jpeg, gif, webp, svg`
- Неподдерживаемые файлы пропускаются с toast-уведомлением.

## 6) YouTubeOptionsDialog (модалка выбора действия)

Показывается поверх интерфейса, затемняет фон (`bg-black/50`).

### Содержимое

- Заголовок: **Select YouTube Action**
- Опционально: заголовок текущего видео/страницы
- Варианты:
  1. **Add current video** (только текущее видео)
  2. **Add entire playlist** (если распознан плейлист; показывает количество видео)
  3. **Add all channel videos** (если распознан канал; показывает количество видео)
- Кнопка **Cancel** снизу.

### Состояние загрузки

- Короткий экран `Loading YouTube information...` внутри модалки.

## 7) Upload Queue (`QueueList`)

### Когда пусто

- Сообщение: **No items in queue**

### Когда есть элементы

- Заголовок: **Upload Queue**
- Каждая карточка очереди содержит:
  - Иконку типа (file/page/youtube/note)
  - Заголовок
  - Если файл разбит на части: `Part X of Y`
  - Статус-иконку:
    - done: зеленая галочка
    - processing: желтые часы (анимация)
    - error: красный крест
    - pending: серые часы
  - Кнопку удаления элемента из очереди (иконка корзины)
  - Progress bar, если доступен прогресс `< 100%`

## 8) All Sources (`SourcesList`)

Секция отделена верхней границей, это управление уже загруженными источниками в текущем notebook.

### Header секции

- Заголовок: **All Sources (N)**
- Кнопки справа:
  - **Delete (k)** — появляется только при выбранных элементах
  - **Export** — открывает полноэкранный overlay `ExportDialog`

### Поиск и фильтры

- Search input: `Search sources...`
- Кнопка фильтров (иконка filter) показывает/скрывает chips.
- Фильтры типов:
  - All, PDF, Web, YouTube, Text, Note, Drive, Image, Video, Files

### Список источников

- Блок `Select all`
- Карточки источников:
  - Checkbox
  - Иконка типа
  - Title + URL (если есть)
  - Тип (uppercase badge)
  - Статус/прогресс (с учетом активной upload queue)
- Для выбранных карточек: accent ring.

### Удаление источников

- Массовое удаление с native `confirm(...)`.
- Текст подтверждения: `Delete X source(s)? This action cannot be undone.`

## 9) Export Dialog (полноэкранный режим внутри панели)

Открывается из `All Sources -> Export`, временно заменяет обычный контент (`showExport`).

### Шапка диалога

- Кнопка назад (стрелка)
- Заголовок: **Export Notebook**
- Подзаголовок: название notebook (truncate)
- Иконка package

### Состояние загрузки диалога

- Спиннер + текст `Loading notebook content...`

### Категории экспорта

Категории показываются как аккордеон-карточки с:
- Иконкой/emoji
- Названием
- Счетчиком элементов
- Кратким описанием

Категории:
1. Sources
2. Notes & Reports
3. Slides
4. Flashcards
5. Quiz
6. Data Tables
7. Infographics
8. Chat History

### 9.1 Sources (специальная секция)

- Имеет встроенный поиск и type-фильтры.
- Select all + выбор отдельных source.
- Bulk delete выбранных прямо из export-диалога.
- Режим экспорта:
  - `Combined` / `Individual`
- Форматы:
  - Базово: Markdown, PDF, Text, CSV, Word, JSON, ZIP
  - Для image-only источников: PNG/JPG/WebP/SVG
  - Для смешанных наборов добавляются image-форматы

### 9.2 Notes/Slides/Flashcards/Quiz/Tables/Infographics/Chat

- Для категорий с контентом показываются preview/selection блоки:
  - Slides: сетка миниатюр, выбор конкретных слайдов
  - Infographics: сетка миниатюр, выбор конкретных элементов
  - Flashcards и Quiz: выбор групп артефактов чекбоксами
  - Tables/Notes: списки с чекбоксами
  - Chat: превью первых сообщений
- Для batch-поддерживаемых категорий (кроме slides/infographics/chat) есть toggle `Combined / Individual`.
- Кнопки форматов показываются как компактные outline-кнопки с иконкой Download.

### Пустые состояния категорий

- Текст вида: `No ... found in this notebook.`
- Подсказки, что сначала нужно сгенерировать контент в NotebookLM.
- Для flashcards может быть промежуточный loader:
  - `Loading flashcards and quiz...`
  - пояснение про фоновое открытие артефактов.

## 10) Toast-уведомления и системные диалоги

### Toast

Используются для всех успехов/ошибок:
- Authentication success/error
- Added to queue
- Export complete / Export failed
- Delete success/error
- Copy address success/error

### Native browser dialogs

- `prompt` для rename notebook
- `confirm` для массового удаления источников

## 11) Тексты и язык интерфейса

- Основной язык UI: **English**.
- Тексты короткие, action-oriented, подходят для пошаговых карточек/скриншотов.

## 12) Рекомендуемый сценарий скриншотов для краткого гайда

Ниже минимальный набор кадров, который покрывает весь UX:

1. Экран входа (`Sign in with Google`)
2. Header после входа (статус-точка + выбор notebook)
3. MainContent: `Add Current Page`
4. MainContent: `Quick Note`
5. MainContent: `File Upload` (обычное состояние)
6. YouTubeOptionsDialog (3 варианта добавления)
7. Upload Queue с прогрессом
8. All Sources с поиском/фильтрами
9. All Sources с selected items + Delete
10. Export Dialog: общий вид категорий
11. Export Dialog: Sources (фильтры + форматы)
12. Export Dialog: Slides/Infographics preview selection
13. Export Dialog: Flashcards/Quiz/Tables selection
14. Donate menu dropdown

## 13) Подсказка для генерации иллюстраций в стиле UI

Чтобы в NotebookLM получить изображения, похожие на реальный интерфейс, используйте стиль:

- "Chrome side panel extension UI"
- "compact SaaS admin card layout"
- "light theme, rounded cards, subtle borders, lucide-like line icons"
- "primary/secondary/outline button system"
- "small typography, dense vertical spacing, status dots green/yellow/red"

Пример промпта (адаптировать под конкретный шаг):

`Create a realistic Chrome side-panel UI for an extension called NotebookLM Assistant. Show a compact light-theme interface with a top header, notebook selector, action buttons, rounded cards, subtle gray borders, and lucide-style icons. Include an "All Sources" list with checkboxes, search bar, filter chips, and an "Export" button.`

