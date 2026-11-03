import { Env } from "./env";
import { HttpError } from "./http";

/* Photos on a place's note. The browser shrinks them first, so one fits well inside a D1 row. */

export const maxMediaBytes = 1_500_000;
const contentTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const isId = (value: string | null): value is string => !!value && value.length <= 100;

export async function uploadMedia(env: Env, request: Request, mapId: string, noteId: string | null): Promise<{id: string, url: string}> {
    if (!isId(mapId) || !isId(noteId)) {
        throw new HttpError(422, "A photo needs a map and a place.");
    }
    const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentTypes.includes(contentType)) {
        throw new HttpError(415, "Only JPEG, PNG, WebP and GIF photos can be added.");
    }
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > maxMediaBytes) {
        throw new HttpError(413, "That photo is too large.");
    }
    const data = await request.arrayBuffer();
    if (data.byteLength === 0) {
        throw new HttpError(422, "That photo is empty.");
    }
    if (data.byteLength > maxMediaBytes) {
        throw new HttpError(413, "That photo is too large.");
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
        "INSERT INTO media (id, map_id, note_id, content_type, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, mapId, noteId, contentType, data.byteLength, data, new Date().toISOString()).run();
    return {id, url: `/api/media/${id}`};
}

export async function getMedia(env: Env, id: string): Promise<Response> {
    const row = await env.DB.prepare("SELECT content_type, data FROM media WHERE id = ?")
        .bind(id).first<{content_type: string, data: ArrayBuffer | number[]}>();
    if (!row) {
        throw new HttpError(404, "No such photo.");
    }
    const bytes = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data);
    return new Response(bytes, {
        headers: {
            "content-type": row.content_type,
            // a photo never changes once uploaded; only this signed-in browser may keep it
            "cache-control": "private, max-age=31536000, immutable",
            "x-content-type-options": "nosniff"
        }
    });
}
