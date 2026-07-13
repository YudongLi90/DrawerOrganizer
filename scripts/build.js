// Bundle src/ into a single JS file, obfuscate it, and stage everything
// GitHub Pages should serve into dist/.
//
// Layout after build:
//   dist/index.html   (rewritten to load ./bundle.js as a classic script)
//   dist/bundle.js    (obfuscated, no exports/imports)
//   dist/styles.css   (unchanged)
//
// Deliberately does NOT copy quote_server/, stl-gen/, info/, or any *.json
// design samples. GitHub Pages only needs the customer-facing assets.

import { build } from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// 1. Bundle src/app.js and its imports into one IIFE. IIFE (not ESM) so the
//    obfuscated output can be loaded via a plain <script> tag.
await build({
  entryPoints: [resolve(ROOT, "src/app.js")],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  outfile: resolve(DIST, "bundle.js"),
  minify: true,
  logLevel: "info",
});

// 2. Obfuscate. controlFlowFlattening + stringArray encoding is the same
//    combo the precisioncrafted3d.com bundle uses. This adds ~3x size and
//    ~2x runtime; acceptable for a small designer.
const source = readFileSync(resolve(DIST, "bundle.js"), "utf8");
const obf = JavaScriptObfuscator.obfuscate(source, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: "hexadecimal",
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 6,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.85,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
});
writeFileSync(resolve(DIST, "bundle.js"), obf.getObfuscatedCode());

// 3. Rewrite index.html: swap the ESM src/app.js reference for the built
//    bundle.js and drop the whole src/ tree from the deploy.
const html = readFileSync(resolve(ROOT, "index.html"), "utf8")
  .replace(
    /<script type="module" src="src\/app\.js"><\/script>/,
    '<script src="bundle.js" defer></script>',
  );
writeFileSync(resolve(DIST, "index.html"), html);

// 4. Copy remaining static assets.
cpSync(resolve(ROOT, "styles.css"), resolve(DIST, "styles.css"));
cpSync(resolve(ROOT, "photos"), resolve(DIST, "photos"), { recursive: true });

console.log("build complete:", DIST);
