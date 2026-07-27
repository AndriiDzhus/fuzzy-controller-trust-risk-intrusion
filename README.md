# Multi-Controller Fuzzy Inference Platform for System Security Assessment

**Fuzzy Trust · Risk · Intrusion Controllers** — платформа з трьома нечіткими контролерами та єдиним UI:

- Trust Index: `errors`, `connections`, `bytes` -> `trustIndex`
- Security Risk: `energy`, `strength`, `response` -> `risk`
- Intrusion Probability: `packets`, `rate`, `delivery` -> `intrusion`

Package npm: `fuzzy-trust-risk-intrusion-controller`

## Архітектура

### Backend

- `server.js` — Express API + static frontend
- `fuzzyController.js` — наявний trust-контролер (fuzzyIS)
- `controllers.js` — уніфікований шар для 3 контролерів

Уніфіковані ендпоінти:

- `POST /api/controllers/:controller/calculate`
- `GET /api/controllers/:controller/membership-functions`

де `:controller` in `trust | security | intrusion`.

### Frontend

- `public/fuzzy-page-core.js` — спільний reusable модуль для:
  - синхронізації input/range
  - API викликів
  - рендеру membership-блоків
  - рендеру графіків
  - єдиних легенд
  - tooltips при наведенні
- `public/script.js`, `public/security.js`, `public/intrusion.js` — thin wrappers з конфігурацією сторінки.

### i18n

- `public/i18n.json` — словник (uk default + en)
- `public/i18n-helper.js` — завантаження перекладів, switcher мови, подія `languageChanged`

## Запуск

```bash
npm install
npm start
```

Сервер за замовчуванням: `http://localhost:3002`.

## Розгортання на GitHub Pages

GitHub Pages обслуговує лише статичні файли, тому для публічного демо використовується
статична збірка з локальними обчисленнями контролерів у браузері.

### 1. Увімкнути GitHub Pages

1. Відкрийте репозиторій на GitHub: `AndriiDzhus/fuzzy-logic-security-risk`
2. Перейдіть у **Settings → Pages**
3. У полі **Build and deployment → Source** оберіть **GitHub Actions**

### 2. Запустити деплой

Після push у гілку `main` або `master` workflow **Deploy to GitHub Pages** автоматично:

- запускає тести;
- збирає статичну версію (`npm run build:pages`);
- публікує її на GitHub Pages.

Також можна запустити деплой вручну: **Actions → Deploy to GitHub Pages → Run workflow**.

### 3. Посилання на демо

Після успішного деплою додаток буде доступний за адресою:

`https://andriidzhus.github.io/fuzzy-logic-security-risk/`

### Локальна перевірка статичної версії

```bash
npm install
npm run build:pages
npx serve dist
```

Локальний запуск через `npm start` як і раніше використовує Express API.

## API schema

## 1) Trust controller

### Calculate

`POST /api/controllers/trust/calculate`

Request:

```json
{
  "errors": 50,
  "connections": 40,
  "bytes": 70
}
```

Response:

```json
{
  "value": 43.27,
  "dominantTerm": "Medium",
  "membershipData": {
    "errors": { "Low": 0.0, "Medium": 1.0, "High": 0.0 },
    "connections": { "Low": 0.0, "Medium": 0.5, "High": 0.5 },
    "bytes": { "Low": 0.0, "Medium": 0.5, "High": 0.5 },
    "trustIndex": { "VeryLow": 0.0, "Low": 0.27, "Medium": 0.73, "High": 0.0, "VeryHigh": 0.0 }
  },
  "ruleOutputs": null,
  "inputs": {
    "errors": 50,
    "connections": 40,
    "bytes": 70
  }
}
```

### Membership functions

`GET /api/controllers/trust/membership-functions`

Response (shape):

```json
{
  "inputs": {
    "errors": { "Low": [{ "x": 0, "y": 1 }], "Medium": [], "High": [] },
    "connections": { "Low": [], "Medium": [], "High": [] },
    "bytes": { "Low": [], "Medium": [], "High": [] }
  },
  "output": {
    "trustIndex": { "VeryLow": [], "Low": [], "Medium": [], "High": [], "VeryHigh": [] }
  },
  "meta": {
    "inputKeys": ["errors", "connections", "bytes"],
    "outputKey": "trustIndex"
  }
}
```

## 2) Security controller

### Calculate

`POST /api/controllers/security/calculate`

Request:

```json
{
  "energy": 80,
  "strength": 20,
  "response": 90
}
```

Response:

```json
{
  "value": 88.0,
  "dominantTerm": "veryHigh",
  "membershipData": {
    "energy": { "low": 0.0, "medium": 0.0, "high": 0.6 },
    "strength": { "low": 0.6, "medium": 0.0, "high": 0.0 },
    "response": { "low": 0.0, "medium": 0.0, "high": 0.5 },
    "risk": { "none": 0.0, "veryLow": 0.0, "low": 0.0, "medium": 0.0, "high": 0.0, "veryHigh": 0.5 }
  },
  "ruleOutputs": {
    "none": 0.0,
    "veryLow": 0.0,
    "low": 0.0,
    "medium": 0.0,
    "high": 0.0,
    "veryHigh": 0.5
  },
  "inputs": {
    "energy": 80,
    "strength": 20,
    "response": 90
  }
}
```

### Membership functions

`GET /api/controllers/security/membership-functions`

Response (shape):

```json
{
  "inputs": {
    "energy": { "low": [], "medium": [], "high": [] },
    "strength": { "low": [], "medium": [], "high": [] },
    "response": { "low": [], "medium": [], "high": [] }
  },
  "output": {
    "risk": {}
  },
  "meta": {
    "inputKeys": ["energy", "strength", "response"],
    "outputKey": "risk",
    "singletonValues": {
      "none": 0,
      "veryLow": 20,
      "low": 40,
      "medium": 60,
      "high": 80,
      "veryHigh": 100
    }
  }
}
```

## 3) Intrusion controller

### Calculate

`POST /api/controllers/intrusion/calculate`

Request:

```json
{
  "packets": 90,
  "rate": 30,
  "delivery": 60
}
```

Response:

```json
{
  "value": 78.36,
  "dominantTerm": "high",
  "membershipData": {
    "packets": { "low": 0.0, "medium": 0.32, "high": 0.71 },
    "rate": { "low": 0.04, "medium": 0.82, "high": 0.0 },
    "delivery": { "low": 0.01, "medium": 0.97, "high": 0.0 },
    "intrusion": { "none": 0.0, "low": 0.18, "medium": 0.22, "high": 0.41 }
  },
  "ruleOutputs": {
    "none": 0.0,
    "low": 0.18,
    "medium": 0.22,
    "high": 0.41
  },
  "inputs": {
    "packets": 90,
    "rate": 30,
    "delivery": 60
  }
}
```

### Membership functions

`GET /api/controllers/intrusion/membership-functions`

Response (shape):

```json
{
  "inputs": {
    "packets": { "low": [], "medium": [], "high": [] },
    "rate": { "low": [], "medium": [], "high": [] },
    "delivery": { "low": [], "medium": [], "high": [] }
  },
  "output": {
    "intrusion": { "none": [], "low": [], "medium": [], "high": [] }
  },
  "meta": {
    "inputKeys": ["packets", "rate", "delivery"],
    "outputKey": "intrusion"
  }
}
```

## Validation and errors

Для всіх `POST /api/controllers/:controller/calculate`:

- вхідні значення мають бути числами у діапазоні `[0, 100]`
- при помилці валідації повертається `400`

Error response:

```json
{
  "error": "Invalid input values. All values must be between 0 and 100."
}
```

## Тести

```bash
npm test
```

Покрито:

- юніт-тести trust/security/intrusion
- інтеграційні тести API
- e2e smoke-тест меню, switcher мови і завантаження спільного frontend-модуля
