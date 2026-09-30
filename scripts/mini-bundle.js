/**
 * A minimal CommonJS bundler used by build-pages.js when esbuild cannot run
 * on this machine (its native binary is platform-specific; for example the
 * node_modules of macOS in a Linux sandbox). Enough for this project: string
 * literal require() of relative files, JSON files and plain packages of
 * node_modules (their "main" file). No minification, no ES modules.
 *
 *   const { bundle } = require("./mini-bundle");
 *   fs.writeFileSync(out, bundle(entryPath));
 */
const fs = require("fs");
const path = require("path");

const REQUIRE_RE = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g;

function resolveFile(base) {
  const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, "index.js")];
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function resolvePackage(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const root = path.join(dir, "node_modules", name);
    if (fs.existsSync(root)) {
      if (fs.statSync(root).isFile()) return root;
      const pkgFile = path.join(root, "package.json");
      const main = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, "utf8")).main || "index.js" : "index.js";
      const resolved = resolveFile(path.join(root, main));
      if (resolved) return resolved;
    }
    // Sub-path of a package: "fuzzyis/lib/CorrectedTerm".
    const sub = resolveFile(path.join(dir, "node_modules", name));
    if (sub) return sub;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolve(request, fromFile) {
  const fromDir = path.dirname(fromFile);
  const resolved = request.startsWith(".") || request.startsWith("/")
    ? resolveFile(path.resolve(fromDir, request))
    : resolvePackage(request, fromDir);
  if (!resolved) throw new Error(`mini-bundle: cannot resolve "${request}" from ${fromFile}`);
  return resolved;
}

/**
 * @param {string} entry absolute path of the entry file
 * @returns {string} the bundle: an IIFE with a module registry
 */
function bundle(entry) {
  const modules = new Map(); // absolute path -> {id, code, deps: {request: id}}
  const order = [];
  const visit = (file) => {
    if (modules.has(file)) return modules.get(file).id;
    const id = modules.size;
    const entryRecord = { id, code: "", deps: {} };
    modules.set(file, entryRecord);
    if (file.endsWith(".json")) {
      entryRecord.code = `module.exports = ${fs.readFileSync(file, "utf8")};`;
    } else {
      const source = fs.readFileSync(file, "utf8");
      // Strip a shebang line of a script entry.
      entryRecord.code = source.replace(/^#!.*\n/, "");
      let match;
      REQUIRE_RE.lastIndex = 0;
      while ((match = REQUIRE_RE.exec(source))) {
        const request = match[2];
        if (entryRecord.deps[request] !== undefined) continue;
        entryRecord.deps[request] = visit(resolve(request, file));
      }
    }
    order.push(file);
    return id;
  };
  const entryId = visit(entry);

  const definitions = order
    .map((file) => {
      const { id, code, deps } = modules.get(file);
      return `${id}: [function (module, exports, require) {\n${code}\n}, ${JSON.stringify(deps)}]`;
    })
    .join(",\n");

  return `(function () {
  var definitions = {\n${definitions}\n  };
  var cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    var module = { exports: {} };
    cache[id] = module;
    var definition = definitions[id];
    var deps = definition[1];
    definition[0](module, module.exports, function (request) {
      if (deps[request] === undefined) throw new Error("mini-bundle: module not found: " + request);
      return load(deps[request]);
    });
    return module.exports;
  }
  load(${entryId});
})();
`;
}

module.exports = { bundle };
