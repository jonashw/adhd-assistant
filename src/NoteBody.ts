/* A place's note, Keep-style: text, checklist items and photos in one ordered list.
   It is stored as plain markdown in the node's body, so an export or Claude reads it as ordinary text:
   a checklist item is "- [ ] words" or "- [x] words", a photo is "![caption](url)" on its own line,
   and everything else is text. */

export type NoteBlock =
    | {kind: "text", text: string}
    | {kind: "check", checked: boolean, text: string}
    | {kind: "image", src: string, alt: string};

const checkPattern = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;
const imagePattern = /^\s*!\[([^\]]*)\]\((\S+?)\)\s*$/;

export function parseNote(body: string | undefined): NoteBlock[] {
    const blocks: NoteBlock[] = [];
    let text: string[] = [];
    const flush = () => {
        const joined = text.join("\n").replace(/^\n+|\n+$/g, "");
        if (joined.trim()) {
            blocks.push({kind: "text", text: joined});
        }
        text = [];
    };
    for (const line of (body ?? "").split(/\r?\n/)) {
        const check = checkPattern.exec(line);
        const image = check ? null : imagePattern.exec(line);
        if (check) {
            flush();
            blocks.push({kind: "check", checked: check[1] !== " ", text: check[2]});
        } else if (image) {
            flush();
            blocks.push({kind: "image", alt: image[1], src: image[2]});
        } else {
            text.push(line);
        }
    }
    flush();
    return blocks;
}

export function serializeNote(blocks: NoteBlock[]): string {
    const out: string[] = [];
    blocks.forEach((block, i) => {
        const previous = blocks[i - 1];
        // blank lines keep text apart from what's around it; checklist items stay one list
        if (previous && !(previous.kind === "check" && block.kind === "check")) {
            out.push("");
        }
        switch (block.kind) {
            case "text":
                out.push(block.text);
                break;
            case "check":
                out.push(`- [${block.checked ? "x" : " "}] ${block.text.replace(/\s*\n\s*/g, " ")}`);
                break;
            case "image":
                out.push(`![${block.alt.replace(/[[\]\n]/g, " ")}](${block.src})`);
                break;
        }
    });
    return out.join("\n");
}

const edit = (body: string | undefined, change: (blocks: NoteBlock[]) => NoteBlock[]): string =>
    serializeNote(change(parseNote(body)));

export const NoteBody = {
    toggle: (body: string | undefined, index: number): string =>
        edit(body, blocks => blocks.map((b, i) => i === index && b.kind === "check" ? {...b, checked: !b.checked} : b)),
    remove: (body: string | undefined, index: number): string =>
        edit(body, blocks => blocks.filter((_, i) => i !== index)),
    /* A new checklist item goes right after the last one, or at the end when there is no list yet */
    addCheck: (body: string | undefined, text: string): string =>
        edit(body, blocks => {
            let last = -1;
            blocks.forEach((b, i) => b.kind === "check" && (last = i));
            const item: NoteBlock = {kind: "check", checked: false, text: text.trim()};
            return last < 0 ? [...blocks, item] : [...blocks.slice(0, last + 1), item, ...blocks.slice(last + 1)];
        }),
    addImage: (body: string | undefined, src: string, alt = ""): string =>
        edit(body, blocks => [...blocks, {kind: "image", src, alt}]),
    /* Counts for a one-line summary, e.g. on the outline: "2 of 5 done, 1 photo" */
    summary: (body: string | undefined): {checks: number, checked: number, images: number, hasText: boolean} => {
        const blocks = parseNote(body);
        return {
            checks: blocks.filter(b => b.kind === "check").length,
            checked: blocks.filter(b => b.kind === "check" && b.checked).length,
            images: blocks.filter(b => b.kind === "image").length,
            hasText: blocks.some(b => b.kind === "text")
        };
    }
};

/* Shrinks a photo so it uploads fast and fits the server's limit: at most maxSide pixels on its longest side, as JPEG */
export async function shrinkImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("That photo couldn't be read.")), "image/jpeg", quality));
}

export const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
