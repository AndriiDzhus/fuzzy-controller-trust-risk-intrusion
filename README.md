# Multi-Controller Fuzzy Inference Platform for System Security Assessment

A research and teaching platform for fuzzy inference with three controllers that assess
the security of Internet of Things devices. Every step of the inference is shown
separately: fuzzification, rule evaluation, accumulation (normalisation for Sugeno),
defuzzification. Interface languages: Ukrainian (default) and English.

| Controller | Dataset | Inputs | Output | Model | Defuzzification |
|---|---|---|---|---|---|
| Trust | NSL-KDD | ER, CC, BS — trapezoids | TI — 5 triangles | Mamdani, 27 rules, min | exact analytic centre of gravity (eq. 2.22–2.28) |
| Security | 6G IoT | EC, TP, Lat — triangles | SR — 6 singletons | Sugeno of order 0, 6 rules, product; **ANFIS training** | weighted sum Σ w̄·c |
| Intrusion | CICIoT2023 | NP, Rate, We — Gaussians | IP — 4 Gaussians | Mamdani, 12 rules, min; **GA optimisation** | centre of gravity, sum with step 0.2 |

Security and Intrusion can be trained right on the page: the **"Model training"** block
before the "Fuzzification" step (see "Training the controllers"). The expert parameters
of the assignment stay unchanged until a trained result is applied.

## Architecture

```
server.js                         Express: static UI + controller API
src/
  engine/                         fuzzy inference engine
    index.js                      public interface of the engine
    membershipFunctions.js        triangle, trapezoid, Gaussian; SafeTerm (FuzzyIS Term)
    model.js                      model description with FuzzyIS: variables, terms, rules, FIS
    inference.js                  fuzzification, t-norms min / product, rule strengths
    mamdani.js                    clip heights, max-min aggregation, centre of gravity
    sugeno.js                     weight normalisation, weighted consequents, Σ w̄·c
    sampling.js                   uniform grids and sampling for the charts
  controllers/
    index.js                      controller registry (API and static build)
    trustController.js            Trust model and inference
    securityController.js         Security model and inference
    intrusionController.js        Intrusion model and inference
    surface.js                    response surface: output as a function of two inputs
    trained/security.json         parameters of the trained Security model (ANFIS, npm run train:security)
    trained/intrusion.json        parameters of the trained Intrusion model (GA, npm run train:intrusion)
  training/
    anfis.js                      hybrid ANFIS training: least squares + gradient descent (epoch generator)
    genetic.js                    genetic algorithm: chromosome of 74 genes (generation generator)
    datasets.js                   dataset format, xlsx/csv parsing, split into samples, default datasets
    session.js                    training session: progress, stop, metrics before/after, parameter diff
    jobs.js, worker-node.js       API training jobs in worker_threads, progress events
    utils.js                      seeded random, CSV, metrics, least squares
public/
  index.html  trust.js            Trust page
  security.html  security.js      Security page
  intrusion.html  intrusion.js    Intrusion page
  simulation.html  simulation.js  Joint assessment page: the three controllers on one stream of observations,
  simulation.css                  integral information-security level, scenarios, timeline
  fuzzy-page-core.js              shared UI: inputs, charts, inference steps, hints
  controller-docs.js              "Formulas" and "Rule base" modals (also for the trained model)
  training-panel.js               "Model training" block: dataset, live chart, results, apply
  training-backend.js             where the training runs: API (server) or Web Worker (static build)
  xlsx-lite.js                    reading / writing .xlsx without dependencies (Node and browser)
  surface-view.js                 "Response surface" modal: 3D surface on canvas
  i18n.json  i18n-helper.js       uk / en translations
  term-colors.js  style.css  navigation.css
scripts/
  train-security.js               ANFIS training -> src/controllers/trained/security.json
  train-intrusion.js              GA optimisation -> src/controllers/trained/intrusion.json
  build-pages.js                  static build for GitHub Pages (dist/)
  training-worker-entry.js        training Web Worker for the static build
  mini-bundle.js                  fallback bundler when esbuild cannot run on this machine
  controllers-browser-entry.js    window.fuzzyControllers = src/controllers
__tests__/                        Jest + supertest
data/                             security-100.csv, intrusion-100.csv — datasets of the app (4 columns; sources
                                  and row selection — data/README.md; sources/ — row numbers of the sources)
docs/tasks/                       assignments and theory chapters
```

### Engine and controllers

The models of all three controllers are described with the **FuzzyIS** library
(`LinguisticVariable`, `Term`, `Rule`, `FIS`). The inference steps are implemented in
`src/engine` explicitly, by the formulas of the thesis, because FuzzyIS supports only min
as the "AND" operation, its built-in defuzzification (`FIS.getPreciseOutput`) computes the
bisector rather than the centre of gravity, and it stores rule strengths in shared
objects. Therefore `getPreciseOutput` is not used.

Every controller has the same interface:

```js
module.exports = { system, variables, ranges, calculate, membershipFunctions };
```

and the same structure of `calculate()`:

| Step | Mamdani (Trust, Intrusion) | Sugeno (Security) |
|---|---|---|
| 1 | `fuzzify` | `fuzzify` |
| 2 | `evaluateRules(..., "min")` | `evaluateRules(..., "product")` |
| 3 | `mamdaniActivations` + `aggregatedUnion` | `sugenoWeightedSum`: normalisation w̄ = w / Σw |
| 4 | `exactCentroid` / `discreteCentroid` | `sugenoWeightedSum`: SR = Σ w̄·c |

### API

- `POST /api/controllers/:controller/calculate`
- `GET /api/controllers/:controller/membership-functions`
- `POST /api/controllers/:controller/surface` — response surface
  (`{ xKey, yKey, inputs, points }` → `{ x, y, z, fixed }`, `z[j][i]` = output at `(x[i], y[j])`,
  `null` where no rule fired)

where `:controller` is `trust | security | intrusion`. The `?model=trained` parameter
selects the model trained by the script (404 if there is none yet);
`GET /api/controllers/:controller/models` returns the list of available models and a
training summary. If the body of a POST request contains `params` (a training result
applied on the page), the model is built from them; `membership-functions` accepts POST
for that purpose.

Training on the page:

- `GET /api/controllers/:controller/dataset?rows=N|all` — the default dataset (.xlsx);
  N ≥ 10, N not smaller than the dataset gives all rows (headers `X-Row-Count`, `X-Row-Total`)
- `GET /api/controllers/:controller/dataset/info` — size and columns of the default dataset
- `POST /api/training/:controller/jobs?name=<file>&generations=…` — request body: an .xlsx or .csv file;
  response — the job (`id`, split into samples, parameters)
- `GET /api/training/jobs/:id/events` — progress as server-sent events (`snapshot`, `progress`, `done`, `error`, `end`)
- `GET /api/training/jobs/:id`, `POST /api/training/jobs/:id/stop`

The static build for GitHub Pages computes the same in the browser through
`window.fuzzyControllers`.

### Frontend

- `public/fuzzy-page-core.js` — shared module of the pages: slider synchronisation,
  calls of the API or of the local controllers, charts, rule cards, hints, sticky header.
- `public/trust.js`, `public/security.js`, `public/intrusion.js` — page configuration.
- `public/controller-docs.js` — formulas and rule bases for the modals; the test
  `__tests__/docsConsistency.test.js` checks them against the controller models.
- `public/i18n.json`, `public/i18n-helper.js` — translations (uk by default, en).

## Joint assessment page

`simulation.html` ("Joint assessment" in the menu) runs the three controllers together on one stream of observations of a
device. Every step is one observation window: nine inputs (three per controller) come from
a scenario (normal operation, DDoS flood, scanning, resource exhaustion / jamming, mixed) or
from the sliders, the controllers compute TI, SR and IP, and the page combines them into the
**information-security level**: each output is mapped to a partial security score on
0–100 (TI, 100 − SR, 100 − IP) and the level is their fuzzy conjunction with the t-norm min —
the weakest-link principle. The level is described by the five terms of the trust index; a
response policy with two thresholds (warning, critical) gives the state of the device and the
event log. The page shows gauges of the three outputs, a "security triangle" of the partial
scores and the time series of all assessments, and can switch the risk and intrusion
controllers to their trained parameters. The gauges and the level bar are split into the
zones of the policy (normal / warning / critical, recomputed when the thresholds change;
for SR and IP the scale is inverted, since more is worse) and are filled with the colour of
the zone the value is in; the series themselves keep neutral colours (blue, violet, teal). The computations are the same as on the controller
pages (API with the local server, `window.fuzzyControllers` in the static build).

## Training the controllers

The data and the expert labelling are described in [data/README.md](data/README.md).

```bash
npm run train:security     # ANFIS on data/security-100.csv (--data <csv> — another file)
npm run train:intrusion    # GA on data/intrusion-100.csv (--data <csv> — another file; ≈ 10 s)
```

**Security, ANFIS** (Adaptive Neuro-Fuzzy Inference System; thesis section 3.4.4). The base
of 6 rules does not change (rule mask). In every epoch the 6 consequents are first computed
by least squares, C = (AᵀA)⁻¹Aᵀy, from the normalised rule weights. Then the 18 break
points of the triangles (L: c; M: a, b, c; H: a, b for every input) are moved by gradient
descent with subgradients at the break points. The break points are normalised to [0, 1];
each one moves along its own gradient component with its own step: a step that does not
reduce the error, or leaves some row without a fired rule, is rejected and halved. The
epoch with the smallest error is kept, provided that no row is left without a fired rule.

**Intrusion, genetic algorithm** (sections 4.3.4–4.3.5). A chromosome of 74 genes:
18 parameters (c, σ) of the input Gaussians, 8 parameters of the output Gaussians and
48 integer genes of the structure of the 12 rules. Fitness F = 1 / (1 + RMSE), tournament
selection. Arithmetic crossover for the real genes and two-point crossover (on rule
boundaries) for the rule genes. Gaussian mutation for the real genes and re-assignment of
the term index for the rule genes. Validation keeps σ ≥ ε, the centres inside the universe,
ordered terms (low < medium < high) with a minimum distance of 10 % between the centres,
and no two rules with the same premises. The next generation is the best N of parents
and offspring.

Default parameters (`METHODS` in `src/training/session.js`; the theory gives them as
symbols, the numbers are taken from the MATLAB experiments of the thesis): ANFIS — 100
epochs (stopping when the error has not decreased for 25 epochs in a row); GA — N₀ = 150,
N = 100, 150 generations, target RMSE 0 (off), seed 42; it also stops after 60 generations
without improvement. The centre of gravity in the GA is computed as a sum with step 0.2,
as in the controller, so the expert chromosome gives the same RMSE as the expert model.

There are two default datasets, one per controller (`data/security-100.csv` and
`data/intrusion-100.csv`, 100 rows each). The input values are taken from open datasets
(6G IoT Intelligent Management Dataset and CIC IoT Dataset 2023); the rows were selected so
that the file covers the working range of every input and every rule; the reference output
values were formed from the expert analysis and the expert model of the controller. The
app splits the data into samples itself. Indicative results (RMSE on the training sample,
before → after): ANFIS — 3.9 → 0.33 (MATLAB 0.361 on 40 + 10 rows); GA — 7.2 → 0.05, both
changed rules recovered (MATLAB 0.0297 → 0.0186). Details in
[data/README.md](data/README.md).
The other constants (crossover probability 0.5 and mutation 0.04 / 0.003, mutation σ
2 % → 0.03 % of the gene span — the range of the variable, or 8 term widths if the term is
narrow — tournament of 3) are fixed in the code. The ANFIS gradient step is separate for
each of the 18 break points (backtracking per parameter). The GA returns the chromosome of
the generation with the smallest validation error; the "mean RMSE" on the chart is over
all offspring of the generation before selection, as in MATLAB.

### The "Model training" block on the page

On the Security and Intrusion pages, before the "Fuzzification" step, there is a
"Model training" accordion (badge ANFIS or GA):

The block has three steps: **1 Data → 2 Training → 3 Result**; the theory and the data
description are hidden in the expandable "How the training works and what data it needs".

1. **Data** — the default dataset (100 rows: `security-100.csv` or `intrusion-100.csv`)
   as `.xlsx`; the file is always complete. The file name and a link to it are also shown
   in step 2 while there is no result. Columns: Intrusion — NP, Rate, We, IP; Security —
   EC, TP, Lat, SR. Next to it — the user's own `.xlsx` / `.csv` file with the same columns;
   the training starts right after the file is chosen. The split into samples (70/15/15 or
   70/30) is automatic. The algorithm parameters (generations, N, N₀, target RMSE, seed;
   epochs) are in an expandable block; every field has a "?" icon with an explanation.
2. **Training** — in the empty state, the button "Train on the default dataset" with the
   chosen dataset size; during the training — tiles (generation / epoch, RMSE of every
   series, F), progress, a live RMSE chart (GA: best / population mean / validation;
   ANFIS: training / test, starting from epoch 0 — the expert model), the "Stop" button.
3. **Result** — RMSE and R² before → after on all samples, balanced detection accuracy
   (Intrusion), "What changed": membership function charts before / after, a parameter
   table, the changed rules.
4. **"Apply to the controller"** — all steps, charts, the "Formulas" / "Rule base" modals
   and the response surface switch to the trained parameters (the state is kept in the
   browser between reloads); **"Restore the expert parameters"** undoes it.

With the local server the training runs on the server in a separate thread and the
progress is streamed as server-sent events; in the static build it runs in a Web Worker
right in the browser (`dist/training-worker.js`). The results are identical (fixed seed).

The `npm run train:*` scripts train on `data/*.csv` and save the result in
`src/controllers/trained/*.json` (available through the API as `?model=trained`).

## Running

```bash
npm install
npm start      # http://localhost:3002
npm run dev    # with auto-restart (nodemon)
```

## Deployment on GitHub Pages

GitHub Pages serves static files only, so the public demo uses a static build with the
controllers computed locally in the browser.

### 1. Enable GitHub Pages

1. Open the repository on GitHub: `AndriiDzhus/fuzzy-logic-security-risk`
2. Go to **Settings → Pages**
3. In **Build and deployment → Source** choose **GitHub Actions**

### 2. Run the deployment

After a push to the `main` or `master` branch the **Deploy to GitHub Pages** workflow
automatically:

- runs the tests;
- builds the static version (`npm run build:pages`);
- publishes it on GitHub Pages.

The deployment can also be started by hand: **Actions → Deploy to GitHub Pages → Run workflow**.

### 3. Demo link

After a successful deployment the app is available at:

`https://andriidzhus.github.io/fuzzy-logic-security-risk/`

### Checking the static version locally

```bash
npm install
npm run build:pages
npx serve dist
```

A local run with `npm start` still uses the Express API.

## API

### Trust

`POST /api/controllers/trust/calculate`

```json
{ "errors": 0.25, "connections": 50, "bytes": 7.5 }
```

Response (abridged):

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

`ruleEvaluations` contains all 27 rules, `aggregatedOutput` — the accumulated set together
with the break points of the polygon.

### Security

`POST /api/controllers/security/calculate`

```json
{ "energy": 0.03, "strength": 25, "response": 6 }
```

`energy`, `strength`, `response` are EC, TP and Lat. Response (abridged):

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

If none of the 6 rules fired (for example `{ "energy": 0.025, "strength": 0, "response": 0 }`),
the response is `"value": null`, `"dominantTerm": null`, `"noRuleFired": true`.

### Intrusion

`POST /api/controllers/intrusion/calculate`

```json
{ "packets": 14, "rate": 1500, "weight": 240 }
```

Response (abridged):

```json
{
  "value": 87.8,
  "dominantTerm": "high",
  "ruleOutputs": { "none": 0, "low": 0, "medium": 0, "high": 0.882 },
  "aggregatedOutput": [{ "x": 0, "y": 0 }]
}
```

`aggregatedOutput` — 501 points of the grid [0, 100] with step 0.2 over which the centre of
gravity is computed.

### Membership functions

`GET /api/controllers/:controller/membership-functions` returns the sampled curves of the
terms for the charts:

```json
{
  "inputs": { "<input>": { "<term>": [{ "x": 0, "y": 1 }] } },
  "output": { "<output>": { "<term>": [] } },
  "meta": { "inputKeys": [], "outputKey": "", "inputDomains": {} }
}
```

For Security `output.risk` is empty and `meta.singletonValues` holds the positions of the
singletons; `meta.tnorm = "product"`.

### Validation

Every input must be a number within its domain:

| Controller | Inputs |
|---|---|
| trust | `errors` [0, 1], `connections` [0, 200], `bytes` [0, 12] |
| security | `energy` [0, 0.05], `strength` [0, 40], `response` [0, 10] |
| intrusion | `packets` [0, 15], `rate` [0, 3000], `weight` [0, 250] |

Otherwise `400` is returned:

```json
{ "error": "Invalid input values. All values must be within the allowed range." }
```

## Tests

```bash
npm test
```

| File | What it checks |
|---|---|
| `engine.test.js` | models as FuzzyIS objects, purity of the inference, t-norms, centroids, Sugeno |
| `trustController.test.js` | Trust: terms, rules, exact centre of gravity |
| `securityController.test.js` | Security: membership functions of the assignment, product, Σ w̄·c, holes of the rule base, term names |
| `intrusionController.test.js` | Intrusion: rule peaks, aggregated set, grid |
| `docsConsistency.test.js` | the formula and rule modals match the models |
| `surface.test.js` | the response surface matches `calculate`, Security holes, API |
| `controllerDocs.test.js`, `termColors.test.js` | modals and term colours |
| `integration.test.js`, `e2e.smoke.test.js` | API and pages |
