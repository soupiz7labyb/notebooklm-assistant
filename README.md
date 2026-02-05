# NotebookLM Assistant

Chrome Extension для отправки веб-страниц, видео, файлов и текста напрямую в проекты Google NotebookLM.

## Возможности

- ✅ Авторизация через Google OAuth
- ✅ Управление проектами NotebookLM (список, создание, выбор)
- ✅ Захват контента веб-страниц (с очисткой от рекламы и навигации)
- ✅ Отправка выделенного текста через контекстное меню
- ✅ Интеграция с YouTube (отправка ссылок)
- ✅ Загрузка файлов через Drag & Drop:
  - Документы: PDF, TXT, MD, DOCX
  - Изображения: PNG, JPG, JPEG, GIF, WEBP, SVG
  - И другие форматы, поддерживаемые NotebookLM API
- ✅ Smart Chunking для больших текстов (автоматическое разбиение на части)
- ✅ Очередь загрузки с прогресс-баром
- ✅ Side Panel интерфейс

## Технологии

- **React 18** + **TypeScript**
- **Vite** + **CRXJS** для сборки расширения
- **Tailwind CSS** + **Shadcn/UI** для UI
- **Zustand** для state management
- **Chrome Extension Manifest V3**

## Установка и Разработка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка Google OAuth

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите **People API** (или **Google+ API** если доступен)
4. Перейдите в **APIs & Services > Credentials**
5. Нажмите **Create Credentials > OAuth client ID**
6. Выберите **Web application** как тип приложения (не Chrome Extension!)
7. В поле **Authorized redirect URIs** добавьте:
   ```
   https://<ваш-extension-id>.chromiumapp.org/
   ```
   *Extension ID вы получите после первой загрузки расширения*
8. Скопируйте **Client ID**
9. Откройте `src/manifest.json` и замените `YOUR_CLIENT_ID_HERE` на ваш Client ID

**Важно:** После первой загрузки расширения скопируйте Extension ID из `chrome://extensions/` и обновите redirect URI в Google Cloud Console.

### 3. Разработка

```bash
npm run dev
```

Это запустит Vite dev server с HMR. Расширение будет собираться в папку `dist`.

### 4. Загрузка расширения в Chrome

**Важно:** Сначала выполните `npm run dev` или `npm run build`, чтобы создать папку `dist`.

1. Откройте `chrome://extensions/`
2. Включите "Режим разработчика" (переключатель в правом верхнем углу)
3. Нажмите "Загрузить распакованное расширение"
4. Выберите папку `dist` из корня проекта

### 5. Сборка для production

```bash
npm run build
```

## Важные замечания

### Reverse Engineering API

Поскольку у NotebookLM нет публичного API, расширение пытается использовать внутренние эндпоинты. Для правильной работы:

1. Откройте `notebooklm.google.com` в Chrome
2. Откройте DevTools > Network
3. Выполните действия (создайте блокнот, добавьте источник)
4. Найдите API запросы и обновите эндпоинты в `src/services/notebooklm-api.ts`

Возможные эндпоинты:
- `/api/v1/notebooks` - список блокнотов
- `/api/v1/notebooks/{id}/sources` - добавление источника

### Авторизация

Расширение использует cookies браузера для доступа к NotebookLM. Убедитесь, что вы залогинены в `notebooklm.google.com` в том же браузере.

## Структура проекта

```
src/
├── components/          # React компоненты
│   ├── ui/             # Shadcn/UI компоненты
│   ├── Header.tsx       # Заголовок с выбором проекта
│   ├── MainContent.tsx # Основной контент (кнопки, формы)
│   ├── QueueList.tsx   # Список очереди загрузки
│   └── AuthScreen.tsx  # Экран авторизации
├── services/           # Бизнес-логика
│   ├── auth.ts         # Google OAuth
│   ├── notebooklm-api.ts # API NotebookLM
│   ├── content-parser.ts # Парсинг веб-страниц
│   ├── file-processor.ts # Обработка файлов
│   └── upload-queue.ts  # Очередь загрузки
├── store/              # Zustand store
├── lib/                # Утилиты
│   ├── text-splitter.ts # Smart chunking
│   └── constants.ts    # Константы
├── background/         # Service Worker
└── manifest.json       # Манифест расширения
```

## TODO / Известные проблемы

- [ ] Реализовать извлечение транскрипции YouTube
- [ ] Улучшить парсинг PDF и DOCX (использовать библиотеки)
- [ ] Добавить настройки (размер чанков, задержка очереди)
- [ ] Добавить поиск/фильтр проектов
- [ ] Улучшить обработку ошибок API

## Лицензия

MIT
