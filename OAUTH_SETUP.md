# Настройка OAuth (Опционально)

OAuth настройка **не обязательна** для работы расширения! Расширение может работать используя cookies браузера, если вы уже залогинены в `notebooklm.google.com`.

## Если хотите использовать OAuth:

### Вариант 1: Без OAuth (рекомендуется для начала)

Просто убедитесь, что вы залогинены в `notebooklm.google.com` в том же браузере. Расширение будет использовать ваши cookies для доступа.

### Вариант 2: Настройка OAuth для получения email пользователя

Если вы хотите, чтобы расширение получало email пользователя через OAuth:

1. **Откройте [Google Cloud Console](https://console.cloud.google.com/)**

2. **Создайте новый проект** или выберите существующий

3. **Включите People API:**
   - Перейдите в **APIs & Services > Library**
   - Найдите **People API**
   - Нажмите **Enable**

4. **Создайте OAuth 2.0 Client ID:**
   - Перейдите в **APIs & Services > Credentials**
   - Нажмите **Create Credentials > OAuth client ID**
   - Выберите **Chrome App** (если доступно) или **Web application**
   
   **Важно для Chrome Extension:**
   - Если выбран **Chrome App**: просто скопируйте Client ID
   - Если выбран **Web application**: 
     - Получите Extension ID из `chrome://extensions/` (после загрузки расширения)
     - Добавьте redirect URI: `https://<ваш-extension-id>.chromiumapp.org/`

5. **Добавьте Client ID в манифест:**
   - Откройте `src/manifest.json`
   - Раскомментируйте секцию `oauth2`:
   ```json
   "oauth2": {
     "client_id": "ВАШ_CLIENT_ID.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/userinfo.email",
       "https://www.googleapis.com/auth/userinfo.profile"
     ]
   },
   ```

6. **Пересоберите расширение:**
   ```bash
   npm run build
   ```

7. **Перезагрузите расширение в Chrome**

## Решение проблем

### Ошибка "bad client id"

1. Убедитесь, что Client ID правильный (без пробелов, полный)
2. Проверьте, что в Google Cloud Console проект активен
3. Убедитесь, что People API включен
4. Если используете Web application, проверьте redirect URI

### OAuth не работает, но расширение работает

Это нормально! Расширение может работать только через cookies. OAuth нужен только для получения email пользователя.

### Полностью отключить OAuth

Просто удалите или закомментируйте секцию `oauth2` в `src/manifest.json`. Расширение будет работать через cookies.
