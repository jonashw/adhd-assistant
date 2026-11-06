// Checks Jon's Inkscape files in art/ against the contract in art/README.md, so a file that would
// break the app is caught before it lands. Run: npm run art:check
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../art/", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const maxBytes = 60_000;
const forbidden = [
    [/<image\b/i, "embedded or linked raster images (<image>): draw it as vectors"],
    [/<script\b/i, "scripts"],
    [/<foreignObject\b/i, "foreignObject"],
    [/<text\b/i, "live text: use Path > Object to Path"],
    [/<filter\b|filter\s*[:=]/i, "filters (blur, drop shadow): the app animates these many times a second; ask first"],
    [/(xlink:)?href\s*=\s*["'](https?:|data:)/i, "links to outside files or data: URIs"],
    [/@import|url\(\s*["']?https?:/i, "outside stylesheets or fonts"]
];

let failures = 0;
const fail = (file, msg) => {
    failures++;
    console.error(`✗ ${file}: ${msg}`);
};

for (const [file, rule] of Object.entries(manifest)) {
    const before = failures;
    const path = join(root, file);
    let svg;
    try {
        svg = readFileSync(path, "utf8");
    } catch {
        fail(file, "missing");
        continue;
    }
    const size = statSync(path).size;
    if (size > maxBytes) {
        fail(file, `${size} bytes; keep it under ${maxBytes} (File > Save As > Optimized SVG helps)`);
    }
    const viewBox = svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/)?.[1]?.trim().split(/[\s,]+/).map(Number).join(" ");
    if (viewBox !== rule.viewBox) {
        fail(file, `frame (viewBox) is "${viewBox}", the app expects "${rule.viewBox}" (Document Properties > Viewbox)`);
    }
    for (const id of rule.required) {
        if (!new RegExp(`\\bid\\s*=\\s*["']${id}["']`).test(svg)) {
            fail(file, `no element with id "${id}" (Object > Object Properties > ID)`);
        }
    }
    const ids = [...svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) {
        fail(file, `ids used twice: ${[...new Set(dupes)].join(", ")}`);
    }
    for (const [pattern, what] of forbidden) {
        if (pattern.test(svg)) {
            fail(file, `contains ${what}`);
        }
    }
    if (failures === before) {
        console.log(`✓ ${file}`);
    }
}
if (failures) {
    console.error(`\n${failures} problem(s). See art/README.md.`);
    process.exit(1);
}
