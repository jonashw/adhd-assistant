// Turns Jon's Inkscape files in art/ into src/crew/art.generated.ts, which the crew components draw from.
// Checks them first (scripts/check-art.mjs). Run: npm run art   (the build runs it too)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const here = new URL(".", import.meta.url).pathname;
execFileSync(process.execPath, [join(here, "check-art.mjs")], {stdio: "inherit"});

const root = join(here, "../art/");
const out = join(here, "../src/crew/art.generated.ts");
const SVG = "http://www.w3.org/2000/svg";

function load(file) {
    const doc = new DOMParser().parseFromString(readFileSync(join(root, file), "utf8"), "image/svg+xml");
    const svg = doc.documentElement;
    const viewBox = svg.getAttribute("viewBox").trim().split(/[\s,]+/).map(Number);
    const byId = id => {
        const all = svg.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (all[i].getAttribute("id") === id) return all[i];
        }
        throw new Error(`${file}: no element with id "${id}"`);
    };
    return {file, svg, viewBox, byId};
}

// an element as markup the app can repeat many times on one page: ids become class names,
// Inkscape's own bookkeeping is dropped, and a layer is always shown (the app picks which)
function clean(el) {
    const copy = el.cloneNode(true);
    const walk = node => {
        if (node.nodeType !== 1) return;
        for (const attr of Array.from(node.attributes)) {
            const name = attr.name;
            if (name.startsWith("inkscape:") || name.startsWith("sodipodi:") || name.startsWith("xmlns")) {
                node.removeAttribute(name);
            }
        }
        const id = node.getAttribute("id");
        if (id) {
            node.removeAttribute("id");
            node.setAttribute("class", [node.getAttribute("class"), id].filter(Boolean).join(" "));
        }
        const style = node.getAttribute("style");
        if (style && /display\s*:\s*none/.test(style)) {
            const rest = style.replace(/display\s*:\s*none;?/g, "").trim();
            rest ? node.setAttribute("style", rest) : node.removeAttribute("style");
        }
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === 8) node.removeChild(child); //comments
            else walk(child);
        });
    };
    walk(copy);
    return new XMLSerializer().serializeToString(copy).replace(/\s+xmlns(:\w+)?="[^"]*"/g, "").replace(/>\s+</g, "><");
}

function anchor(doc, id) {
    const el = doc.byId(id);
    for (let p = el; p && p !== doc.svg; p = p.parentNode) {
        if (p.getAttribute && p.getAttribute("transform")) {
            throw new Error(`${doc.file}: ${id} (or a group around it) is moved with a transform; ` +
                `in Inkscape, Object > Transform > Apply, or set Preferences > Behavior > Transforms > Store transformation: Optimized`);
        }
    }
    const n = name => Number(el.getAttribute(name) || 0);
    return el.tagName === "rect"
        ? {x: n("x"), y: n("y"), width: n("width"), height: n("height")}
        : {x: n("cx"), y: n("cy")};
}

function layers(doc, prefix) {
    const found = {};
    const all = doc.svg.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
        const id = all[i].getAttribute("id") || "";
        if (id.startsWith(prefix) && all[i].namespaceURI === SVG) {
            found[id.slice(prefix.length)] = clean(all[i]);
        }
    }
    return found;
}

const face = load("you/face.svg");
const balloon = load("you/balloon.svg");

const art = {
    face: {viewBox: face.viewBox, layers: layers(face, "face-")},
    balloon: {
        viewBox: balloon.viewBox,
        art: clean(balloon.byId("art")),
        anchors: {face: anchor(balloon, "anchor-face"), string: anchor(balloon, "anchor-string")}
    }
};

writeFileSync(out, `/* Made by scripts/build-art.mjs from art/. Don't edit: change the drawing in Inkscape and run npm run art. */
export const art = ${JSON.stringify(art, null, 4)} as const;
`);
console.log(`wrote ${out}`);
