const { controllers } = require("../src/controllers");
const datasets = require("../src/training/datasets");
const session = require("../src/training/session");
const utils = require("../src/training/utils");

// The static build (GitHub Pages) calculates in the browser, so the training
// helpers used by training-backend.js are bundled too; the training itself
// runs in training-worker.js.
window.fuzzyControllers = controllers;
window.fuzzyTraining = { datasets, session, utils };
