const fs = require("fs");
const path = require("path");
const { bundle: miniBundle } = require("./mini-bundle");

// esbuild is used when its native binary runs on this machine; otherwise
// (node_modules installed for another platform) the small bundler of
// scripts/mini-bundle.js produces an unminified but equivalent bundle.
let esbuild = null;
try {
  esbuild = require("esbuild");
  esbuild.buildSync({ stdin: { contents: "" }, write: false, logLevel: "silent" });
} catch (error) {
  console.warn(`esbuild is not available here (${error.message.split("\n")[0]}); using scripts/mini-bundle.js`);
  esbuild = null;
}

function bundleScript(entryPoint, outfile) {
  if (esbuild) {
    esbuild.buildSync({ entryPoints: [entryPoint], bundle: true, platform: "browser", format: "iife", outfile, logLevel: "info" });
  } else {
    fs.writeFileSync(outfile, miniBundle(entryPoint));
  }
}

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const distDir = path.join(rootDir, "dist");
const bundlePath = path.join(distDir, "controllers-bundle.js");
const workerPath = path.join(distDir, "training-worker.js");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function injectBundleScript(htmlPath) {
  const marker = '<script src="fuzzy-page-core.js"></script>';
  const injection =
    '<script src="controllers-bundle.js"></script>\n    <script src="fuzzy-page-core.js"></script>';

  const html = fs.readFileSync(htmlPath, "utf8");
  if (!html.includes(marker)) {
    throw new Error(`Could not inject bundle script into ${htmlPath}`);
  }

  fs.writeFileSync(htmlPath, html.replace(marker, injection));
}

fs.rmSync(distDir, { recursive: true, force: true });
copyDir(publicDir, distDir);
copyDir(path.join(rootDir, "node_modules/katex/dist"), path.join(distDir, "vendor/katex"));
// Default training datasets, fetched by training-backend.js in the static build.
fs.mkdirSync(path.join(distDir, "data"), { recursive: true });
fs.readdirSync(path.join(rootDir, "data"))
  .filter((name) => name.endsWith(".csv"))
  .forEach((name) => fs.copyFileSync(path.join(rootDir, "data", name), path.join(distDir, "data", name)));

// Bundles src/controllers for the browser as window.fuzzyControllers.
bundleScript(path.join(rootDir, "scripts/controllers-browser-entry.js"), bundlePath);

// Web Worker that trains a controller in the browser (training-backend.js).
bundleScript(path.join(rootDir, "scripts/training-worker-entry.js"), workerPath);

for (const page of ["index.html", "security.html", "intrusion.html"]) {
  injectBundleScript(path.join(distDir, page));
}

fs.writeFileSync(path.join(distDir, ".nojekyll"), "");

console.log("Static build ready in dist/");
