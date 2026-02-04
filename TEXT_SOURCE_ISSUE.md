# Проблема с добавлением текстовых источников в NotebookLM

## Описание проблемы

Расширение для Chrome успешно добавляет **URL-источники** (веб-страницы, PDF по ссылке) в NotebookLM, но **не добавляет текстовые источники** (ручной текст и файлы через drag & drop).

## Причина проблемы (обнаружена)

Проблема заключается в том, что формат данных (payload), который отправляется в `izAoDd`, **устарел или неполон**.

Ошибка `140` в RPC-вызовах Google обычно означает **Invalid Arguments** (Неверные аргументы) или **Proto Schema Mismatch** (Несовпадение схемы данных). Google часто меняет порядок элементов в массивах RPC (так как это Protobuf-сообщения, сериализованные в массив), и старая структура `[[text, title]]` больше не соответствует ожидаемой сервером схеме.

### Почему работает URL, но не работает Текст?

Для URL рабочий формат: `[null, null, [url]]` - это массив позиционных аргументов:
- Индекс 0: `id` (null при создании)
- Индекс 1: `title` (null, так как берется из метаданных URL)
- Индекс 2: `url_data` (объект `[url]`)

Сервер ожидает, что данные для **Текста** находятся в **другом индексе** этого массива, а не на месте `url_data`. Отправляя `[[text, title]]`, мы пытаемся передать строку `text` в Индекс 0 (где ожидается ID) и `title` в Индекс 1. Это ломает парсер на сервере.

## Что работает

✅ **URL-источники** добавляются успешно:
- Формат payload: `[[null, null, [url]]]`
- RPC вызов: `izAoDd` с параметрами `[sources, notebookId]`
- В ответе сразу появляется UUID источника
- Код ошибки 412 или 466 (нормально для асинхронной обработки)
- Источник появляется в ноутбуке сразу

Пример успешного ответа для URL:
```
)]}'

376
[["wrb.fr","izAoDd","[[[[\"995be3e1-ffa1-4f42-821d-9c8ffc09822d\"],\"Charter Fleet - Global 5000 | Elit'Avia\",[null,428,[1770204610,108880000],[\"e8c38bf6-edbd-48e6-9283-179d56b1ef41\",[1770204609,833592000]],5,null,1,[\"https://elitavia.com/charter-fleet-global-5000/\"],786],[null,2]]]]",null,null,null,"generic"],["di",1675],["af.httprm",1674,"-1430969614136898465",79]]
25
[["e",4,null,null,412]]
```

UUID виден в ответе: `995be3e1-ffa1-4f42-821d-9c8ffc09822d`

## Что не работает

❌ **Текстовые источники** не добавляются:
- Формат payload: `[[text, title]]` (точно как в оригинальном проекте)
- RPC вызов: `izAoDd` с параметрами `[[[text, title]], notebookId]`
- В ответе **НЕТ UUID** источника
- Код ошибки 140 (нормально для асинхронной обработки)
- Источник **НЕ появляется** в ноутбуке даже через несколько минут

Пример ответа для текста:
```
)]}'

104
[["wrb.fr","izAoDd",null,null,null,[3],"generic"],["di",17],["af.httprm",17,"6087942515095975436",82]]
25
[["e",4,null,null,140]]
```

UUID **отсутствует** в ответе.

## Технические детали

### Используемый API

NotebookLM использует внутренний RPC API:
- Endpoint: `https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute`
- RPC ID для добавления источников: `izAoDd`
- Аутентификация: токены `bl` (cfb2h) и `at` (SNlM0e) из HTML страницы

### Формат запроса

**Для URL-источников (работает):**
```javascript
const sources = [[null, null, [url]]];
const response = await rpc('izAoDd', [sources, notebookId], `/notebook/${notebookId}`);
```

**Для текстовых источников (старый формат - не работает):**
```javascript
const source = [[text, title]]; // ❌ Устаревший формат
const response = await rpc('izAoDd', [source, notebookId], `/notebook/${notebookId}`);
```

**Для текстовых источников (новый формат - нужно проверить):**
```javascript
// Гипотеза: позиционный массив, как для URL
const source = [null, title, null, [text]]; // Текст в индексе 3
// Или: [null, title, null, null, [text]]; // Текст в индексе 4
const sources = [source];
const response = await rpc('izAoDd', [sources, notebookId], `/notebook/${notebookId}`);
```

### Формат ответа

Ответ приходит в формате:
```
)]}'

<number>
[["wrb.fr","izAoDd",<data>,null,null,null,"generic"],...]
<number>
[["e",4,null,null,<errorCode>]]
```

Для URL-источников в `<data>` есть полная информация включая UUID.
Для текстовых источников `<data>` = `null`.

## Что уже испробовано

1. ✅ Проверен формат payload - точно как в оригинальном проекте `[[text, title]]`
2. ✅ Проверены коды ошибок - 140 считается нормальным для асинхронной обработки
3. ✅ Добавлено ожидание и проверка появления источника (до 60 секунд)
4. ✅ Проверка по количеству источников и по названию
5. ✅ Использован тот же RPC ID `izAoDd` что и для URL
6. ✅ Использованы те же токены аутентификации

## Решение: "Сниффинг" актуального формата

Так как документации нет, единственный способ узнать *текущий* правильный индекс — посмотреть, что отправляет сам браузер.

### Инструкция по сниффингу:

1. Откройте **NotebookLM** в браузере
2. Нажмите **F12** (Developer Tools) -> вкладка **Network**
3. В фильтре напишите `batchexecute`
4. **Вручную** добавьте текстовый источник:
   - Нажмите "Add source" -> "Copied text" (или вставьте текст из буфера)
   - Нажмите "Insert" / "Add"
5. В списке запросов появится новый `batchexecute`. Нажмите на него
6. Посмотрите вкладку **Payload** (или Request Body). Найдите строку `f.req`
7. Скопируйте это значение и раскодируйте (это URL-encoded JSON). Вы увидите массив
8. Найдите структуру, похожую на ваш текст

**Скорее всего, вы увидите что-то вроде:**
- `[null, "Ваш заголовок", null, ["Ваш текст"], ...]` (Текст в индексе 3)
- Или: `[null, "Ваш заголовок", null, null, ["Ваш текст"], ...]` (Текст в индексе 4)

### Альтернативные форматы для тестирования:

**Вариант А: Текст в индексе 3**
```javascript
const source = [null, title, null, [text]];
```

**Вариант Б: Текст в индексе 4**
```javascript
const source = [null, title, null, null, [text]];
```

**Вариант В: Текст в индексе 3, title в индексе 4**
```javascript
const source = [null, null, null, [text], title];
```

## Референсный проект

Используется как референс проект `add_to_NotebookLM-main`, который успешно добавляет текстовые источники. Код там идентичен нашему:

```javascript
async addTextSource(notebookId, text, title = 'Imported content') {
  const source = [[text, title]];
  const response = await this.rpc('izAoDd', [source, notebookId], `/notebook/${notebookId}`);
  return response;
}
```

Но в нашем случае это не работает, хотя формат точно такой же.

## Логи для отладки

При добавлении текстового источника:
```
addTextSource called: {
  notebookId: "b3fe2a44-1fcd-4a72-9e46-295df1668af1",
  textLength: 15,
  title: "Test note",
  payloadPreview: "[[\"Test note text\",\"Test note\"]]"
}

addTextSource RPC response: )]}'

104
[["wrb.fr","izAoDd",null,null,null,[3],"generic"],["di",17],["af.httprm",17,"6087942515095975436",82]]
25
[["e",4,null,null,140]]

addTextSource error code: 140
Error code 140 is normal for async processing
No UUID found in response - source may be processing asynchronously
```

## Контекст

- Chrome Extension (Manifest V3)
- Используется `chrome.cookies` для получения сессии NotebookLM
- Токены извлекаются из HTML страницы NotebookLM
- RPC вызовы делаются через `fetch` с cookies и токенами

## Цель

Нужно найти способ успешно добавлять текстовые источники в NotebookLM через RPC API, аналогично тому, как это работает для URL-источников.
