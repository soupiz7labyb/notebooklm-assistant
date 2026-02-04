# Как найти API эндпоинты NotebookLM

Поскольку у NotebookLM нет публичного API, нужно найти внутренние эндпоинты через Network tab.

## Шаг 1: Откройте NotebookLM и DevTools

1. Откройте `notebooklm.google.com` в Chrome
2. Убедитесь, что вы залогинены
3. Откройте **DevTools** (F12)
4. Перейдите на вкладку **Network**

## Шаг 2: Найдите запросы для списка ноутбуков

1. **Обновите страницу** (F5) или перейдите на страницу со списком ноутбуков
2. В Network tab найдите запросы, которые загружают список ноутбуков:
   - Обычно это запросы типа **XHR** или **Fetch**
   - Ищите запросы с именами типа: `notebooks`, `projects`, `list`, `get`
   - URL может содержать: `/api/`, `/v1/`, `/notebooks`, `/projects`

## Шаг 3: Изучите найденный запрос

1. Кликните на запрос
2. Посмотрите вкладку **Headers**:
   - Скопируйте **Request URL** (например: `https://notebooklm.google.com/api/v1/notebooks`)
   - Посмотрите **Request Method** (обычно GET)
   - Проверьте **Request Headers** (может быть нужен Authorization header)

3. Посмотрите вкладку **Response**:
   - Увидите структуру данных
   - Запомните, как называются поля (id, name, title и т.д.)

## Шаг 4: Обновите код

Откройте `src/services/notebooklm-api.ts` и обновите метод `getNotebooks()`:

```typescript
static async getNotebooks(): Promise<Notebook[]> {
  // Замените на реальный эндпоинт
  const response = await this.fetchWithAuth('/api/v1/notebooks'); // <-- ваш эндпоинт
  
  if (!response.ok) {
    throw new Error('Failed to fetch notebooks');
  }
  
  const data = await response.json();
  
  // Обновите в зависимости от структуры ответа
  return data.notebooks.map((item: any) => ({
    id: item.id, // <-- ваше поле
    name: item.name, // <-- ваше поле
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}
```

## Шаг 5: Найдите эндпоинт для создания ноутбука

1. В NotebookLM создайте новый ноутбук
2. В Network tab найдите запрос, который создает ноутбук:
   - Обычно это **POST** запрос
   - URL может быть: `/api/v1/notebooks`, `/api/notebooks/create` и т.д.

3. Обновите метод `createNotebook()` в `notebooklm-api.ts`

## Шаг 6: Найдите эндпоинт для добавления источника

1. В NotebookLM добавьте источник (текст, URL, файл)
2. В Network tab найдите запрос:
   - Обычно это **POST** запрос
   - URL может быть: `/api/v1/notebooks/{id}/sources`, `/api/notebooks/{id}/add` и т.д.

3. Обновите метод `addSource()` в `notebooklm-api.ts`

## Примеры возможных эндпоинтов

### Google Workspace API pattern:
- `/_/notebooks` - список
- `/_/notebooks/create` - создание
- `/_/notebooks/{id}/sources` - добавление источника

### REST API pattern:
- `/api/v1/notebooks` - список
- `POST /api/v1/notebooks` - создание
- `POST /api/v1/notebooks/{id}/sources` - добавление источника

### GraphQL pattern:
- Может быть один эндпоинт `/graphql` с разными запросами

## Важно

- Некоторые запросы могут требовать специальные headers (Authorization, X-Requested-With и т.д.)
- Может потребоваться отправлять cookies определенным образом
- Структура ответа может отличаться от ожидаемой

## После обновления

1. Пересоберите расширение: `npm run build`
2. Перезагрузите расширение в Chrome
3. Проверьте, что ноутбуки загружаются
