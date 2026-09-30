# Multi-Controller Fuzzy Inference Platform for System Security Assessment

Навчально-дослідна платформа нечіткого виводу з трьома контролерами для оцінювання
безпеки пристроїв Інтернету речей. Кожен крок виводу показано окремо: фазифікація,
оцінка правил, акумуляція (нормалізація для Sugeno), дефазифікація. Мови інтерфейсу:
українська (за замовчуванням) та англійська.

| Контролер | Датасет | Входи | Вихід | Модель | Дефазифікація |
|---|---|---|---|---|---|
| Trust | NSL-KDD | ER, CC, BS — трапеції | TI — 5 трикутників | Mamdani, 27 правил, min | точний аналітичний центр тяжіння (ф. 2.22–2.28) |
| Security | 6G IoT | EC, TP, Lat — трикутники | SR — 6 синглтонів | Sugeno 0-го порядку, 6 правил, добуток | зважена сума Σ w̄·c |
| Intrusion | CICIoT2023 | NP, Rate, We — гаусові | IP — 4 гаусові | Mamdani, 12 правил, min | центр тяжіння, сума з кроком 0,2 |

## Архітектура

```
server.js                         Express: статичний UI + API контролерів
src/
  engine/                         рушій нечіткого виводу
    index.js                      публічний інтерфейс рушія
    membershipFunctions.js        трикутник, трапеція, гаусова; SafeTerm (FuzzyIS Term)
    model.js                      опис моделі засобами FuzzyIS: змінні, терми, правила, FIS
    inference.js                  фазифікація, t-норми min / добуток, сила правил
    mamdani.js                    висоти зрізу, max-min агрегація, центр тяжіння
    sugeno.js                     нормалізація ваг, зважені наслідки, Σ w̄·c
    sampling.js                   рівномірні сітки та дискретизація для графіків
  controllers/
    index.js                      реєстр контролерів (API і статична збірка)
    trustController.js            модель і вивід Trust
    securityController.js         модель і вивід Security
    intrusionController.js        модель і вивід Intrusion
    surface.js                    поверхня відгуку: вихід як функція двох входів
public/
  index.html  trust.js            сторінка Trust
  security.html  security.js      сторінка Security
  intrusion.html  intrusion.js    сторінка Intrusion
  fuzzy-page-core.js              спільний UI: входи, графіки, кроки виводу, підказки
  controller-docs.js              модалки «Формули» та «База правил»
  surface-view.js                 модалка «Поверхня відгуку»: 3D-поверхня на canvas
  i18n.json  i18n-helper.js       переклади uk / en
  term-colors.js  style.css  navigation.css
scripts/
  build-pages.js                  статична збірка для GitHub Pages (dist/)
  controllers-browser-entry.js    window.fuzzyControllers = src/controllers
__tests__/                        Jest + supertest
docs/tasks/                       завдання та теоретичні розділи
```

### Рушій і контролери

Моделі всіх трьох контролерів описано засобами бібліотеки **FuzzyIS**
(`LinguisticVariable`, `Term`, `Rule`, `FIS`). Кроки виводу реалізовано в `src/engine`
явно, за формулами дисертації, бо FuzzyIS підтримує лише min як операцію «І», а її
вбудована дефазифікація (`FIS.getPreciseOutput`) обчислює бісектор, а не центр тяжіння,
і записує сили правил у спільні об'єкти. Тому `getPreciseOutput` не використовується.

Кожен контролер має однаковий інтерфейс:

```js
module.exports = { system, variables, ranges, calculate, membershipFunctions };
```

і однакову структуру `calculate()`:

| Крок | Mamdani (Trust, Intrusion) | Sugeno (Security) |
|---|---|---|
| 1 | `fuzzify` | `fuzzify` |
| 2 | `evaluateRules(..., "min")` | `evaluateRules(..., "product")` |
| 3 | `mamdaniActivations` + `aggregatedUnion` | `sugenoWeightedSum`: нормалізація w̄ = w / Σw |
| 4 | `exactCentroid` / `discreteCentroid` | `sugenoWeightedSum`: SR = Σ w̄·c |

### API

- `POST /api/controllers/:controller/calculate`
- `GET /api/controllers/:controller/membership-functions`
- `POST /api/controllers/:controller/surface` — поверхня відгуку
  (`{ xKey, yKey, inputs, points }` → `{ x, y, z, fixed }`, `z[j][i]` = вихід у точці `(x[i], y[j])`,
  `null` там, де жодне правило не спрацювало)

де `:controller` — `trust | security | intrusion`. Статична збірка для GitHub Pages
рахує те саме в браузері через `window.fuzzyControllers`.

### Frontend

- `public/fuzzy-page-core.js` — спільний модуль сторінок: синхронізація повзунків,
  виклики API або локальних контролерів, графіки, картки правил, підказки, стікі-хедер.
- `public/trust.js`, `public/security.js`, `public/intrusion.js` — конфігурація сторінок.
- `public/controller-docs.js` — формули та бази правил для модалок; тест
  `__tests__/docsConsistency.test.js` звіряє їх із моделями контролерів.
- `public/i18n.json`, `public/i18n-helper.js` — переклади (uk за замовчуванням, en).

## Запуск

```bash
npm install
npm start      # http://localhost:3002
npm run dev    # з автоперезапуском (nodemon)
```

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

## API

### Trust

`POST /api/controllers/trust/calculate`

```json
{ "errors": 0.25, "connections": 50, "bytes": 7.5 }
```

Відповідь (скорочено):

```json
{
  "value": 25,
  "dominantTerm": "Low",
  "noRuleFired": false,
  "membershipData": {
    "errors": { "Low": 0, "Medium": 1, "High": 0 },
    "connections": { "Low": 0, "Medium": 1, "High": 0 },
    "bytes": { "Low": 0, "Medium": 1, "High": 0 },
    "trustIndex": { "VeryLow": 0, "Low": 1, "Medium": 0, "High": 0, "VeryHigh": 0 }
  },
  "ruleOutputs": { "VeryLow": 0, "Low": 1, "Medium": 0, "High": 0, "VeryHigh": 0 },
  "ruleEvaluations": [
    {
      "index": 14,
      "conditions": [
        { "key": "errors", "symbol": "ER", "term": "Medium", "mu": 1 },
        { "key": "connections", "symbol": "CC", "term": "Medium", "mu": 1 },
        { "key": "bytes", "symbol": "BS", "term": "Medium", "mu": 1 }
      ],
      "out": "Low",
      "alpha": 1,
      "tnorm": "min"
    }
  ],
  "aggregatedOutput": [{ "x": 0, "y": 0 }],
  "inputs": { "errors": 0.25, "connections": 50, "bytes": 7.5 }
}
```

`ruleEvaluations` містить усі 27 правил, `aggregatedOutput` — акумульовану множину
разом із точками зламу многокутника.

### Security

`POST /api/controllers/security/calculate`

```json
{ "energy": 0.03, "strength": 25, "response": 6 }
```

`energy`, `strength`, `response` — це EC, TP і Lat. Відповідь (скорочено):

```json
{
  "value": 33.24,
  "dominantTerm": "veryLow",
  "noRuleFired": false,
  "ruleOutputs": { "none": 0, "veryLow": 0.48, "low": 0, "medium": 0.16, "high": 0.03, "veryHigh": 0.01 },
  "normalizedOutputs": { "none": 0, "veryLow": 0.706, "low": 0, "medium": 0.235, "high": 0.044, "veryHigh": 0.015 },
  "weightedConsequents": [
    { "index": 2, "out": "veryLow", "weight": 0.48, "normalizedWeight": 0.706, "consequent": 20, "weighted": 14.118 }
  ],
  "ruleEvaluations": [],
  "membershipData": {}
}
```

Якщо жодне з 6 правил не спрацювало (наприклад, `{ "energy": 0.025, "strength": 0, "response": 0 }`),
повертається `"value": null`, `"dominantTerm": null`, `"noRuleFired": true`.

### Intrusion

`POST /api/controllers/intrusion/calculate`

```json
{ "packets": 14, "rate": 1500, "weight": 240 }
```

Відповідь (скорочено):

```json
{
  "value": 87.8,
  "dominantTerm": "high",
  "ruleOutputs": { "none": 0, "low": 0, "medium": 0, "high": 0.882 },
  "aggregatedOutput": [{ "x": 0, "y": 0 }]
}
```

`aggregatedOutput` — 501 точка сітки [0, 100] з кроком 0,2, за якими рахується центр тяжіння.

### Функції належності

`GET /api/controllers/:controller/membership-functions` повертає дискретизовані криві
термів для графіків:

```json
{
  "inputs": { "<input>": { "<term>": [{ "x": 0, "y": 1 }] } },
  "output": { "<output>": { "<term>": [] } },
  "meta": { "inputKeys": [], "outputKey": "", "inputDomains": {} }
}
```

Для Security `output.risk` порожній, а `meta.singletonValues` містить положення синглтонів
і `meta.tnorm = "product"`.

### Валідація

Кожен вхід має бути числом у своїй області визначення:

| Контролер | Входи |
|---|---|
| trust | `errors` [0, 1], `connections` [0, 200], `bytes` [0, 12] |
| security | `energy` [0, 0.05], `strength` [0, 40], `response` [0, 10] |
| intrusion | `packets` [0, 15], `rate` [0, 3000], `weight` [0, 250] |

Інакше повертається `400`:

```json
{ "error": "Invalid input values. All values must be within the allowed range." }
```

## Тести

```bash
npm test
```

| Файл | Що перевіряє |
|---|---|
| `engine.test.js` | моделі як об'єкти FuzzyIS, чистота виводу, t-норми, центроїди, Sugeno |
| `trustController.test.js` | Trust: терми, правила, точний центр тяжіння |
| `securityController.test.js` | Security: функції належності завдання, добуток, Σ w̄·c, дірки бази правил, назви термів |
| `intrusionController.test.js` | Intrusion: піки правил, агрегована множина, сітка |
| `docsConsistency.test.js` | модалки формул і правил збігаються з моделями |
| `surface.test.js` | поверхня відгуку збігається з `calculate`, дірки Security, API |
| `controllerDocs.test.js`, `termColors.test.js` | модалки та кольори термів |
| `integration.test.js`, `e2e.smoke.test.js` | API та сторінки |
