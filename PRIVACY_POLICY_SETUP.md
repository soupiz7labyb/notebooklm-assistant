# Настройка Privacy Policy для GitHub Pages

## Вариант 1: GitHub Pages (рекомендуется)

### Шаг 1: Создайте репозиторий для Privacy Policy

1. Создайте новый репозиторий на GitHub (например, `notebooklm-assistant-privacy`)
2. Или используйте существующий репозиторий с расширением

### Шаг 2: Загрузите файл privacy-policy.html

1. Загрузите файл `privacy-policy.html` в корень репозитория
2. Или переименуйте его в `index.html` для главной страницы

### Шаг 3: Включите GitHub Pages

1. Перейдите в Settings → Pages
2. В разделе "Source" выберите:
   - Branch: `main` (или `master`)
   - Folder: `/ (root)`
3. Нажмите Save

### Шаг 4: Получите URL

После активации GitHub Pages ваш URL будет:
```
https://<ваш-username>.github.io/<название-репозитория>/privacy-policy.html
```

Или если файл называется `index.html`:
```
https://<ваш-username>.github.io/<название-репозитория>/
```

## Вариант 2: Использовать существующий репозиторий

Если у вас уже есть репозиторий с расширением:

1. Создайте папку `docs/` в корне репозитория
2. Поместите `privacy-policy.html` в `docs/`
3. Переименуйте в `index.html`
4. В Settings → Pages выберите:
   - Source: Deploy from a branch
   - Branch: `main` / `docs` folder

URL будет:
```
https://<ваш-username>.github.io/<название-репозитория>/
```

## Вариант 3: Отдельная ветка gh-pages

1. Создайте ветку `gh-pages`:
   ```bash
   git checkout -b gh-pages
   ```

2. Добавьте `privacy-policy.html` (или `index.html`)

3. Закоммитьте и запушьте:
   ```bash
   git add privacy-policy.html
   git commit -m "Add privacy policy"
   git push origin gh-pages
   ```

4. В Settings → Pages выберите ветку `gh-pages`

## Использование в Chrome Web Store

После публикации на GitHub Pages:

1. Скопируйте URL вашей страницы Privacy Policy
2. В Chrome Web Store Developer Dashboard:
   - Перейдите в раздел "Store listing"
   - В поле "Privacy Policy URL" вставьте ваш URL
   - Пример: `https://yourusername.github.io/notebooklm-assistant-privacy/privacy-policy.html`

## Обновление Privacy Policy

При обновлении политики:

1. Отредактируйте `privacy-policy.html`
2. Обновите дату "Last Updated" (она обновляется автоматически через JavaScript)
3. Закоммитьте и запушьте изменения
4. GitHub Pages обновится автоматически (может занять несколько минут)

## Проверка

После публикации проверьте:

1. Страница доступна по URL
2. Страница корректно отображается
3. Все ссылки работают
4. Дата обновления отображается правильно

## Примеры готовых Privacy Policy

- https://github.com/yourusername/notebooklm-assistant-privacy
- https://yourusername.github.io/notebooklm-assistant-privacy/privacy-policy.html
