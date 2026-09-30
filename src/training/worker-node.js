/**
 * worker_threads entry: runs one training session off the main thread of the
 * Express server, so the API stays responsive while a genetic run takes
 * minutes. Messages: { type: "progress", entry, step } ... { type: "done",
 * result } | { type: "error", message }; the parent posts { type: "stop" }.
 */
const { parentPort, workerData } = require("worker_threads");
const { runTraining } = require("./session");

let stopRequested = false;
parentPort.on("message", (message) => {
  if (message && message.type === "stop") stopRequested = true;
});

runTraining({
  ...workerData,
  onProgress: (entry, info) => parentPort.postMessage({ type: "progress", entry, step: info.step }),
  shouldStop: () => stopRequested,
  // Let the stop message through between steps.
  yieldEach: () => new Promise((resolve) => setImmediate(resolve)),
})
  .then((result) => parentPort.postMessage({ type: "done", result }))
  .catch((error) => parentPort.postMessage({ type: "error", message: error.message }))
  // The message listener above would keep the thread alive: let it exit.
  .finally(() => parentPort.close());
