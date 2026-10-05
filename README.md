# Multi-Controller Fuzzy Inference Platform for System Security Assessment

Навчально-дослідна платформа нечіткого виводу з трьома контролерами для оцінювання
безпеки пристроїв Інтернету речей. Кожен крок виводу показано окремо: фазифікація,
оцінка правил, акумуляція (нормалізація для Sugeno), дефазифікація. Мови інтерфейсу:
українська (за замовчуванням) та англійська.

| Контролер | Датасет | Входи | Вихід | Модель | Дефазифікація |
|---|---|---|---|---|---|
| Trust | NSL-KDD | ER, CC, BS — трапеції | TI — 5 трикутників | Mamdani, 27 правил, min | точний аналітичний центр тяжіння (ф. 2.22–2.28) |
| Security | 6G IoT | EC, TP, Lat — трикутники | SR — 6 синглтонів | Sugeno 0-го порядку, 6 правил, добуток; **навчання ANFIS** | зважена сума Σ w̄·c |
| Intrusion | CICIoT2023 | NP, Rate, We — гаусові | IP — 4 гаусові | Mamdani, 12 правил, min; **оптимізація ГА** | центр тяжіння, сума з кроком 0,2 |

Security та Intrusion можна навчити прямо на сторінці: блок **«Навчання моделі»**
перед кроком «Фазифікація» (див. розділ «Навчання контролерів»). Експертні
параметри з завдання лишаються без змін, доки навчений результат не застосовано.

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
    trained/security.json         параметри навченої моделі Security (ANFIS, npm run train:security)
    trained/intrusion.json        параметри навченої моделі Intrusion (ГА, npm run train:intrusion)
  training/
    anfis.js                      гібридне навчання ANFIS: МНК + градієнтний спуск (генератор епох)
    genetic.js                    генетичний алгоритм: хромосома з 74 генів (генератор поколінь)
    datasets.js                   формат датасетів, розбір xlsx/csv, поділ на вибірки, датасети за замовчуванням
    session.js                    сеанс навчання: прогрес, зупинка, метрики до/після, diff параметрів
    jobs.js, worker-node.js       завдання навчання API у worker_threads, події прогресу
    utils.js                      seeded random, CSV, метрики, МНК
public/
  index.html  trust.js            сторінка Trust
  security.html  security.js      сторінка Security
  intrusion.html  intrusion.js    сторінка Intrusion
  fuzzy-page-core.js              спільний UI: входи, графіки, кроки виводу, підказки
  controller-docs.js              модалки «Формули» та «База правил» (і для навченої моделі)
  training-panel.js               блок «Навчання моделі»: датасет, живий графік, результати, застосування
  training-backend.js             де виконується навчання: API (сервер) або Web Worker (статична збірка)
  xlsx-lite.js                    читання / запис .xlsx без залежностей (Node і браузер)
  surface-view.js                 модалка «Поверхня відгуку»: 3D-поверхня на canvas
  i18n.json  i18n-helper.js       переклади uk / en
  term-colors.js  style.css  navigation.css
scripts/
  data/make-app-datasets.js       датасети апки data/security.csv (200), data/intrusion.csv (500)
  train-security.js               навчання ANFIS -> src/controllers/trained/security.json
  train-intrusion.js              оптимізація ГА -> src/controllers/trained/intrusion.json
  build-pages.js                  статична збірка для GitHub Pages (dist/)
  training-worker-entry.js        Web Worker навчання для статичної збірки
  mini-bundle.js                  запасний бандлер, коли esbuild не запускається на цій машині
  controllers-browser-entry.js    window.fuzzyControllers = src/controllers
__tests__/                        Jest + supertest
data/                             security.csv, intrusion.csv — датасети апки (4 колонки; data/README.md)
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

де `:controller` — `trust | security | intrusion`. Параметр `?model=trained` вибирає
модель, навчену скриптом (404, якщо її ще немає); `GET /api/controllers/:controller/models`
повертає список доступних моделей і підсумок навчання. Якщо тіло POST-запиту містить
`params` (результат навчання, застосований на сторінці), модель будується з них;
`membership-functions` для цього приймає і POST.

Навчання на сторінці:

- `GET /api/controllers/:controller/dataset?rows=N|all` — датасет за замовчуванням (.xlsx);
  N ≥ 10, N не менше за розмір датасету дає всі рядки (заголовки `X-Row-Count`, `X-Row-Total`)
- `GET /api/controllers/:controller/dataset/info` — розмір і колонки датасету за замовчуванням
- `POST /api/training/:controller/jobs?name=<файл>&generations=…` — тіло запиту: файл .xlsx або .csv;
  відповідь — завдання (`id`, поділ на вибірки, параметри)
- `GET /api/training/jobs/:id/events` — прогрес як server-sent events (`snapshot`, `progress`, `done`, `error`, `end`)
- `GET /api/training/jobs/:id`, `POST /api/training/jobs/:id/stop` Статична збірка для GitHub Pages
рахує те саме в браузері через `window.fuzzyControllers`.

### Frontend

- `public/fuzzy-page-core.js` — спільний модуль сторінок: синхронізація повзунків,
  виклики API або локальних контролерів, графіки, картки правил, підказки, стікі-хедер.
- `public/trust.js`, `public/security.js`, `public/intrusion.js` — конфігурація сторінок.
- `public/controller-docs.js` — формули та бази правил для модалок; тест
  `__tests__/docsConsistency.test.js` звіряє їх із моделями контролерів.
- `public/i18n.json`, `public/i18n-helper.js` — переклади (uk за замовчуванням, en).

## Навчання контролерів

Докладно про дані та експертну розмітку — у [data/README.md](data/README.md).

```bash
npm run data:app           # датасети апки (200 / 500 рядків, 4 колонки) -> data/*.csv
npm run train:security     # ANFIS на data/security.csv
npm run train:intrusion    # ГА на data/intrusion.csv (≈ 20 с)
```

**Security, ANFIS** (Adaptive Neuro-Fuzzy Inference System — адаптивна нейро-нечітка система виводу; розділ 3.4.4). База з 6 правил не змінюється (маска правил).
У кожній епосі спершу 6 наслідків обчислюються методом найменших квадратів,
C = (AᵀA)⁻¹Aᵀy, за нормованими вагами правил. Потім 18 точок зламу трикутників
(L: c; M: a, b, c; H: a, b для кожного входу) зсуваються градієнтним спуском із
субградієнтами в точках зламу. Точки зламу нормуються на [0, 1]; кожна рухається
вздовж своєї компоненти градієнта з власним кроком: крок, що не зменшує похибку
або лишає якийсь рядок без спрацьованого правила, відкидається і зменшується вдвічі. Зберігається епоха з найменшою похибкою, за умови що
жоден рядок не лишився без спрацьованого правила.

**Intrusion, генетичний алгоритм** (розділ 4.3.4–4.3.5). Хромосома з 74 генів:
18 параметрів (c, σ) вхідних гаусоїд, 8 параметрів вихідних гаусоїд і 48 цілих
генів структури 12 правил. Пристосованість F = 1 / (1 + RMSE), селекція
турнірна. Кросовер арифметичний для дійсних генів і двоточковий (на межах правил)
для генів правил. Мутація гаусова для дійсних генів і перепризначення індексу
терму для генів правил. Валідація забезпечує σ ≥ ε, центри в межах універсуму,
впорядковані терми (мала < середня < велика) з мінімальною відстанню 10 % між
центрами, а також відсутність двох правил з однаковими передумовами. Наступне
покоління — найкращі N з батьків і нащадків.

Параметри за замовчуванням (`METHODS` у `src/training/session.js`; теорія задає їх
символами, числа взято з MATLAB-експериментів дисертації): ANFIS — 100 епох (із
зупинкою, коли похибка не спадає 25 епох поспіль); ГА — N₀ = 150, N = 100, 150
поколінь, цільова RMSE 0 (вимкнено), seed 42; зупинка також після 60 поколінь без
покращення. Центр ваги в ГА рахується сумою з кроком 0,2, як у контролері, тому
експертна хромосома дає ту саму RMSE, що й експертна модель.

Датасети за замовчуванням (`data/security.csv`, 200 рядків; `data/intrusion.csv`,
500 рядків) мають по чотири колонки: входи, рівномірно розподілені по робочих
діапазонах (Rate — рівномірно в логарифмічній шкалі), і експертна ціль — вихід
експертного контролера з кількома зсунутими параметрами й шумом вимірювання.
Орієнтовні результати: ANFIS ≈ 7,5 → 0,36 (MATLAB 0,361), ГА ≈ 0,83 → 0,06
(MATLAB 0,0297 → 0,0186). Докладніше в [data/README.md](data/README.md).
Решта констант (ймовірності кросоверу 0,5 і мутації 0,04 / 0,003, σ мутації 2 % → 0,03 %
розмаху гена — діапазону змінної або 8 ширин терму, якщо терм вузький, — турнір із 3)
зафіксована в коді. Крок градієнта ANFIS — свій для кожної з
18 точок зламу (backtracking по параметру). ГА повертає хромосому
покоління з найменшою валідаційною похибкою; «середнє RMSE» на графіку — по всіх
нащадках покоління до відбору, як у MATLAB.

### Блок «Навчання моделі» на сторінці

На сторінках Security та Intrusion перед кроком «Фазифікація» є акордеон
«Навчання моделі» (бейдж ANFIS або ГА):

Блок поділено на три кроки: **1 Дані → 2 Навчання → 3 Результат**; теорія і опис даних
сховані в розкривному «Як працює навчання і які дані потрібні».

1. **Дані** — датасет за замовчуванням (`data/security.csv`, 200 рядків; `data/intrusion.csv`,
   500 рядків) як `.xlsx`: весь файл (за замовчуванням) або перші N рядків (мінімум 10).
   Назва файла і посилання на нього показані й у кроці 2, поки результату немає.
   Колонки: Intrusion — NP, Rate, We, IP; Security — EC, TP, Lat, SR. Поруч — власний файл `.xlsx` / `.csv` з такими самими колонками;
   навчання стартує одразу після вибору. Поділ на вибірки (70/15/15 або 70/30)
   робиться автоматично. Параметри алгоритму (покоління, N, N₀, цільова RMSE, seed;
   епохи) — у розкривному блоці; біля кожного поля значок «?» з поясненням.
2. **Навчання** — у порожньому стані кнопка «Навчити на датасеті за замовчуванням» з
   вибраною кількістю рядків; під час навчання — плитки (покоління / епоха, RMSE кожної
   серії, F), прогрес, живий графік RMSE (ГА: найкраще / середнє по популяції /
   валідаційна; ANFIS: навчальна / тестова, починаючи з епохи 0 — експертної моделі),
   кнопка «Зупинити».
3. **Результат** — RMSE і R² до → після на всіх вибірках, збалансована точність виявлення
   (Intrusion), «Що змінилося»: графіки функцій належності до / після, таблиця параметрів,
   змінені правила.
4. **«Застосувати до контролера»** — усі кроки, графіки, модалки «Формули» / «База правил»
   і поверхня відгуку переходять на навчені параметри (стан зберігається в браузері між
   перезавантаженнями); **«Повернути експертні параметри»** скасовує це.

З локальним сервером навчання виконується на сервері в окремому потоці, прогрес іде
через server-sent events; у статичній збірці — у Web Worker прямо в браузері
(`dist/training-worker.js`). Результати однакові (seed фіксовано).

Скрипти `npm run train:*` навчають на `data/*.csv` і зберігають результат у
`src/controllers/trained/*.json` (доступний через API як `?model=trained`).

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
