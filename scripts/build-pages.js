const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const distDir = path.join(rootDir, "dist");
const bundlePath = path.join(distDir, "controllers-bundle.js");

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

// Bundles src/controllers for the browser as window.fuzzyControllers.
esbuild.buildSync({
  entryPoints: [path.join(rootDir, "scripts/controllers-browser-entry.js")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: bundlePath,
  logLevel: "info",
});

for (const page of ["index.html", "security.html", "intrusion.html"]) {
  injectBundleScript(path.join(distDir, page));
}

fs.writeFileSync(path.join(distDir, ".nojekyll"), "");

console.log("Static build ready in dist/");
