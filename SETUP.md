# Инструкция по настройке NotebookLM Assistant

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка Google OAuth

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите **People API** (или **Google+ API** если доступен)
4. Перейдите в **APIs & Services > Credentials**
5. Нажмите **Create Credentials > OAuth client ID**
6. Выберите **Web application** как тип приложения (не Chrome Extension!)
7. В поле **Authorized redirect URIs** добавьте:
   ```
   https://<ваш-extension-id>.chromiumapp.org/
   ```
   *Extension ID вы получите после первой загрузки расширения в Chrome*
8. Скопируйте **Client ID**
9. Откройте `src/manifest.json` и замените `YOUR_CLIENT_ID_HERE` на ваш Client ID

**Важно:** После первой загрузки расширения в Chrome:
- Откройте `chrome://extensions/`
- Найдите ваше расширение и скопируйте **Extension ID**
- Вернитесь в Google Cloud Console и обновите **Authorized redirect URIs** с правильным Extension ID

### 3. Запуск в режиме разработки

Сначала установите зависимости (если еще не установили):
```bash
npm install
```

Затем запустите сборку:
```bash
npm run dev
```

Или для production сборки:
```bash
npm run build
```

После выполнения команды будет создана папка `dist` с собранным расширением.

### 4. Загрузка расширения в Chrome

1. Откройте `chrome://extensions/`
2. Включите **"Режим разработчика"** (Developer mode) (переключатель в правом верхнем углу)
3. Нажмите **"Загрузить распакованное расширение"** (Load unpacked)
4. Выберите папку `dist` из корня проекта (она появится после выполнения `npm run dev` или `npm run build`)

**Примечание:** Если папки `dist` нет, сначала выполните `npm run dev` или `npm run build`

### 5. Первое использование

1. Убедитесь, что вы залогинены в `notebooklm.google.com` в том же браузере
2. Откройте расширение (кликните на иконку в панели расширений)
3. Нажмите **"Sign in with Google"**
4. После авторизации выберите или создайте блокнот

## Важно: Настройка API эндпоинтов

Поскольку у NotebookLM нет публичного API, расширение использует reverse engineering. Для правильной работы:

1. Откройте `notebooklm.google.com` в Chrome
2. Откройте **DevTools > Network**
3. Выполните действия:
   - Создайте новый блокнот
   - Добавьте источник (текст, URL, файл)
4. Найдите API запросы в Network tab
5. Обновите эндпоинты в `src/services/notebooklm-api.ts`

### Возможные эндпоинты:

- **Список блокнотов:** `/api/v1/notebooks` или `/api/notebooks`
- **Создание блокнота:** `POST /api/v1/notebooks`
- **Добавление источника:** `POST /api/v1/notebooks/{id}/sources`

### Пример обновления:

```typescript
// В src/services/notebooklm-api.ts
static async getNotebooks(): Promise<Notebook[]> {
  const response = await this.fetchWithAuth('/api/v1/notebooks'); // Обновите путь
  // ...
}
```

## Сборка для production

```bash
npm run build
```

Готовая сборка будет в папке `dist`.

## Решение проблем

### Ошибка авторизации

- Убедитесь, что Client ID правильный в `manifest.json`
- Проверьте, что вы залогинены в `notebooklm.google.com`
- Проверьте cookies в DevTools

### Ошибка загрузки блокнотов

- Проверьте Network tab в DevTools
- Обновите эндпоинты в `notebooklm-api.ts`
- Убедитесь, что cookies передаются правильно

### Ошибка загрузки файлов

- Проверьте формат файла (поддерживаются: PDF, TXT, MD, DOCX)
- Для больших файлов убедитесь, что chunking работает правильно

## Дополнительные настройки

### Изменение размера чанков

В `src/lib/constants.ts`:

```typescript
export const CHUNK_SIZE = 500000; // Измените на нужное значение
```

### Изменение задержки между запросами

В `src/lib/constants.ts`:

```typescript
export const QUEUE_DELAY_MS = 1000; // Измените на нужное значение
```
