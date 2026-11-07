// Draws the app icon (the Balloon Head) from the same art the crew wears, art/you/balloon.svg and face.svg,
// and writes public/icon.svg plus every favicon and home-screen PNG.
// Run after changing the balloon or the face: npm run icons   (needs Playwright's Chromium to render PNGs)
// Pick another face layer with: npm run icons -- --face mindful
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const here = new URL(".", import.meta.url).pathname;
const art = join(here, "../art/you/");
const pub = join(here, "../public/");
const faceArg = process.argv.indexOf("--face");
const faceName = faceArg > 0 ? process.argv[faceArg + 1] : "calm";

function inner(file, id) {
    const doc = new DOMParser().parseFromString(readFileSync(join(art, file), "utf8"), "image/svg+xml");
    const all = doc.documentElement.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
        if (all[i].getAttribute("id") === id) {
            const el = all[i].cloneNode(true);
            el.removeAttribute("style"); // a hidden layer still shows on the icon
            for (const a of Array.from(el.attributes)) if (a.name.startsWith("inkscape:")) el.removeAttribute(a.name);
            return new XMLSerializer().serializeToString(el)
                .replace(/\s+xmlns(:\w+)?="[^"]*"/g, "")
                .replace(/\s+inkscape:\w+="[^"]*"/g, "")
                .replace(/<!--[\s\S]*?-->/g, "")
                .replace(/>\s+</g, "><");
        }
    }
    throw new Error(`${file}: no element with id "${id}"`);
}

const balloon = inner("balloon.svg", "art");
const face = inner("face.svg", `face-${faceName}`);

// The balloon's origin is its centre and its face box is centred there too, so both share one transform.
// scale is how big the balloon sits on the tile; maskable icons need it smaller (Android crops to a circle).
const icon = ({scale = 3, cy = 41, tile = true} = {}) => {
    const knot = cy + 11.6 * scale;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">` +
        (tile ? `<rect width="100" height="100" fill="#dcebf5"/>` : "") +
        `<path d="M50 ${knot.toFixed(1)} C47 ${(knot + 7).toFixed(1)} 54 ${(knot + 12).toFixed(1)} 50 ${(knot + 20 * scale / 3).toFixed(1)}" fill="none" stroke="#5a4636" stroke-width="${(0.8 * scale).toFixed(2)}" stroke-linecap="round"/>` +
        `<g transform="translate(50 ${cy}) scale(${scale})">${balloon}${face}</g></svg>`;
};

const full = icon();
const maskable = icon({scale: 2.3, cy: 44});
writeFileSync(join(pub, "icon.svg"), full + "\n");
writeFileSync(join(pub, "icon-maskable.svg"), maskable + "\n");

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require("playwright")); } catch {
    console.log("Wrote public/icon.svg. Playwright isn't installed here, so the PNGs were not redrawn.");
    process.exit(0);
}
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size, file) {
    await page.setViewportSize({width: size, height: size});
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const buf = await page.screenshot({omitBackground: true});
    if (file) writeFileSync(join(pub, file), buf);
    return buf;
}
const sizes = [
    [16, "favicon-16x16.png"], [32, "favicon-32x32.png"], [180, "apple-touch-icon.png"],
    [192, "android-chrome-192x192.png"], [512, "android-chrome-512x512.png"],
    [70, "mstile-70x70.png"], [144, "mstile-144x144.png"], [150, "mstile-150x150.png"], [310, "mstile-310x310.png"],
];
for (const [s, f] of sizes) await png(full, s, f);
await png(maskable, 512, "icon-maskable-512x512.png");

// favicon.ico holding 16, 32 and 48 px PNGs
const imgs = [await png(full, 16), await png(full, 32), await png(full, 48)];
const head = Buffer.alloc(6 + 16 * imgs.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let offset = head.length;
imgs.forEach((img, i) => {
    const s = [16, 32, 48][i], e = 6 + 16 * i;
    head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(img.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += img.length;
});
writeFileSync(join(pub, "favicon.ico"), Buffer.concat([head, ...imgs]));
await browser.close();
console.log(`Drew the icon with face-${faceName}: public/icon.svg and ${sizes.length + 2} PNG/ICO files.`);
