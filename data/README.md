# Training data of the controllers

The app works with **one file per controller**: each has only four columns — the three
inputs of the controller and the reference answer. Each file has 100 rows, covers the whole
working range of every input, every rule of the base and the whole range of the target.

| File | Controller, method | Rows | Columns |
|---|---|---|---|
| `security-100.csv` | Security risk, ANFIS | 100 | `EC, TP, Lat, SR` |
| `intrusion-100.csv` | Intrusion probability, GA | 100 | `NP, Rate, We, IP` |

These are the files served by the "Get .xlsx" button of the "Model training" block
(`GET /api/controllers/:controller/dataset`, always the whole file) and used by the
"Train on the default dataset" button. The split into training / validation / test
samples (70/30 for Security risk, 70/15/15 for Intrusion probability) is made by the app
itself, deterministically (seed 42).

## Where the data comes from

**Input values** are records of open datasets:

- Security risk: [6G IoT Intelligent Management Dataset](https://www.kaggle.com/datasets/ziya07/6g-iot-intelligent-management-dataset)
  (Kaggle, M. Ziya, 2024; file `6G_IoT_Beamforming_Dataset.csv`, 1000 records). Columns
  `Energy Consumption (kWh/Gb)`, `Transmit Power (dBm)`, `Latency (ms)` → `EC`, `TP`, `Lat`.
  All 1000 records lie within the working ranges of the controller; 100 were selected.
- Intrusion probability: [CIC IoT Dataset 2023](https://www.unb.ca/cic/datasets/iotdataset-2023.html)
  (Canadian Institute for Cybersecurity, University of New Brunswick; Neto E. C. P. et al.,
  *Sensors*, 2023, 23(13), 5941, [doi:10.3390/s23135941](https://doi.org/10.3390/s23135941)).
  Columns `Number`, `Rate`, `Weight` → `NP`, `Rate`, `We`; records of the test part of the
  dataset within the working ranges of the controller (977 thousand records), 80 of them
  selected. In CIC IoT 2023 the features `Number` and `Weight` are computed from the same
  packet window and are therefore dependent (with `Number` ≈ 9.5 the `Weight` is always
  ≈ 141.5), so the condition combinations of rules 2, 4, 7, 8 and 11 do not occur in real
  traffic. For these five rules 4 expert records each were added near the term centres
  (20 records), so that the rule base is covered completely.

Row selection: for every rule of the controller, records with a membership of ≥ 0.5 to its
conditions were taken (10 per rule, spread by the maximin principle), the rest are records
of the transition zones between the terms. The rows are written in random order, so any
split of the file is representative.

**Reference output values** (`SR`, `IP`) were formed from the expert analysis of the
dependencies between the inputs and the expert model of the controller (thesis chapters
3–4), taking the measurement error into account; `SR` is written with a precision of 0.1,
`IP` — 0.0001.

The files `sources/*.source.csv` are the same rows with the row number of the source
(`6G_row` — row in `6G_IoT_Beamforming_Dataset.csv`; `cic_row` — row in `test.csv` of
CIC IoT 2023, `cic_label` — traffic class label; `expert` — an added expert record).

## Training results

RMSE, expert model → after training (the split is made by the app):

| File | Security risk, ANFIS (100 epochs) | Intrusion probability, GA (150 generations) |
|---|---|---|
| 100 rows | 3.93 → 0.33 (test 4.61 → 0.48) | 7.17 → 0.05 (val 6.31 → 0.08, test 4.24 → 0.07) |

MATLAB (thesis): ANFIS 0.361 (40 + 10 rows, 100 epochs); GA 0.0297 → 0.0186. The GA
recovers both Intrusion rules whose conclusions in the data differ from the expert model
(1 and 3).

The ANFIS curve drops sharply in the first epochs (least squares fits the consequents) and
then slowly approaches the level of the measurement error. The GA curve: the best RMSE
goes down in "steps" during the first ~25 generations (where the GA finds the changed
rules), then refines smoothly; the "mean" over all offspring of a generation before
selection, as in MATLAB, first drops and then "oscillates" (offspring with a changed rule
give large outliers). The chromosome of the generation with the smallest validation error
is returned (protection against overfitting).

Columns of the files:

| Column | Meaning | Range |
|---|---|---|
| `EC` | Energy Consumption, kWh/GB | 0.01–0.05 |
| `TP` | Transmit Power, dBm | 10–35 |
| `Lat` | Latency, ms | 1–10 |
| `SR` | security risk index (ANFIS target) | 0–100 |
| `NP` | Number, number of packets | 0–15 |
| `Rate` | transmission rate, packets/s | 0–3000 |
| `We` | Weight, weight / load | 0–250 |
| `IP` | intrusion probability (GA target) | 0–100 |

Reference points for expert values: SR — output singletons 0 / 20 / 40 / 60 / 80 / 100
(none … very high); IP — term centres 0 "none", 30 "low", 60 "medium", 100 "high".
Intermediate values are allowed.

## Scenario for a lecturer

1. Get the dataset (100 rows) as `.xlsx` and open it in Excel.
2. Change the target column (`SR` or `IP`), add or remove rows (at least 10 training rows).
3. Upload the file back — the training starts right away; compare with the expert model
   and apply.

For Security all input points of the file are also **coverage** points: the trained
triangles cannot leave any of them without a fired rule.

The scripts `npm run train:security` and `npm run train:intrusion` train on the same files
(`--data <csv>` — on another file) and write the result to `src/controllers/trained/*.json`.
