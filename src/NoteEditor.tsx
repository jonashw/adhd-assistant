import React from "react";
import {
    Alert, Box, Button, Checkbox, IconButton, Link, Stack, TextField, Tooltip, Typography
} from "@mui/material";
import { AddPhotoAlternate, AltRoute, Close, Edit } from "@mui/icons-material";
import { blobToDataUrl, NoteBlock, NoteBody, parseNote, shrinkImage } from "./NoteBody";

/* Inline markdown: **bold**, *italic*, `code` and links. Builds React elements, never HTML, so a note can't inject markup. */
const inlinePattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+))/g;

function Inline({text}: {text: string}) {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(inlinePattern)) {
        const at = match.index ?? 0;
        if (at > last) parts.push(text.slice(last, at));
        const [, , bold, italic, code, linkText, linkUrl, bareUrl] = match;
        const key = parts.length;
        if (bold) parts.push(<strong key={key}>{bold}</strong>);
        else if (italic) parts.push(<em key={key}>{italic}</em>);
        else if (code) parts.push(<code key={key}>{code}</code>);
        else parts.push(
            <Link key={key} href={linkUrl ?? bareUrl} target="_blank" rel="noopener noreferrer">{linkText ?? bareUrl}</Link>);
        last = at + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <>{parts}</>;
}

/* A text block: headings, bullet lines and paragraphs */
function Markdown({text}: {text: string}) {
    const paragraphs = text.split(/\n{2,}/);
    return (
        <Box sx={{"& p": {my: 0.5}, overflowWrap: "anywhere"}}>
            {paragraphs.map((paragraph, i) => {
                const heading = /^(#{1,3})\s+(.*)$/.exec(paragraph);
                if (heading) {
                    return <Typography key={i} variant={heading[1].length === 1 ? "h6" : "subtitle1"} fontWeight={600}>
                        <Inline text={heading[2]}/>
                    </Typography>;
                }
                const lines = paragraph.split("\n");
                if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
                    return <Box component="ul" key={i} sx={{my: 0.5, pl: 3}}>
                        {lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*[-*]\s+/, "")}/></li>)}
                    </Box>;
                }
                return <Typography key={i} variant="body2" component="p" sx={{whiteSpace: "pre-wrap"}}>
                    <Inline text={paragraph}/>
                </Typography>;
            })}
        </Box>
    );
}

/* Photos come from this server, the web, or are kept inside the note; anything else isn't shown */
const isSafeSrc = (src: string) => /^(\/api\/media\/|https:\/\/|data:image\/(jpeg|png|webp|gif);)/.test(src);

type Indexed<T> = T & {index: number};

/* Contiguous checklist items render as one list, unchecked first and checked below, like Keep */
function groupBlocks(blocks: NoteBlock[]): (Indexed<NoteBlock> | Indexed<NoteBlock & {kind: "check"}>[])[] {
    const out: (Indexed<NoteBlock> | Indexed<NoteBlock & {kind: "check"}>[])[] = [];
    blocks.forEach((block, index) => {
        if (block.kind === "check") {
            const previous = out[out.length - 1];
            const item = {...block, index};
            if (Array.isArray(previous)) previous.push(item);
            else out.push([item]);
        } else {
            out.push({...block, index});
        }
    });
    return out;
}

/* A place's note: text, a checklist and photos (FR-20) */
export function NoteEditor({body, onChange, onPromote, uploadPhoto}: {
    body: string | undefined,
    onChange: (body: string) => void,
    /* turns a checklist item into a place under this one */
    onPromote: (index: number, text: string) => void,
    /* stores a photo and answers the URL the note points at; undefined keeps photos inside the note */
    uploadPhoto?: (photo: Blob) => Promise<string>
}) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState("");
    const [newItem, setNewItem] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const blocks = parseNote(body);

    const addItem = () => {
        if (newItem.trim()) {
            onChange(NoteBody.addCheck(body, newItem));
            setNewItem("");
        }
    };

    const addPhoto = async (file: File) => {
        setBusy(true);
        setError(undefined);
        try {
            const src = uploadPhoto
                ? await uploadPhoto(await shrinkImage(file))
                // no server: the photo lives inside the note, so keep it small
                : await blobToDataUrl(await shrinkImage(file, 1024, 0.7));
            onChange(NoteBody.addImage(body, src, file.name.replace(/\.[^.]+$/, "")));
        } catch (e) {
            setError((e as Error).message || "That photo couldn't be added.");
        } finally {
            setBusy(false);
        }
    };

    if (editing) {
        return (
            <Box data-testid="note-editor">
                <Typography variant="overline">Note</Typography>
                <TextField
                    multiline minRows={4} fullWidth autoFocus value={draft}
                    onChange={e => setDraft(e.target.value)}
                    helperText="Markdown. A line like “- [ ] milk” is a checklist item; “![caption](link)” is a photo."
                />
                <Stack direction="row" gap={1} justifyContent="flex-end" sx={{mt: 1}}>
                    <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="small" variant="contained" onClick={() => {
                        onChange(draft);
                        setEditing(false);
                    }}>Save note</Button>
                </Stack>
            </Box>
        );
    }

    const checkItem = (item: Indexed<NoteBlock & {kind: "check"}>) => (
        <Stack key={item.index} direction="row" alignItems="center" data-testid="note-check"
            sx={{"&:hover .note-actions, &:focus-within .note-actions": {opacity: 1}}}>
            <Checkbox size="small" checked={item.checked} sx={{p: 0.5}}
                inputProps={{"aria-label": item.text}}
                onChange={() => onChange(NoteBody.toggle(body, item.index))}/>
            <Typography variant="body2" sx={{
                flex: 1, overflowWrap: "anywhere",
                ...(item.checked ? {textDecoration: "line-through", color: "text.secondary"} : {})
            }}><Inline text={item.text}/></Typography>
            <Box className="note-actions" sx={{opacity: {xs: 1, sm: 0.4}, whiteSpace: "nowrap"}}>
                {!item.checked && item.text.trim() &&
                    <Tooltip title="Make it a place under this one">
                        <IconButton size="small" aria-label="Make it a place" onClick={() => onPromote(item.index, item.text)}>
                            <AltRoute fontSize="small"/>
                        </IconButton>
                    </Tooltip>}
                <Tooltip title="Remove">
                    <IconButton size="small" aria-label="Remove item" onClick={() => onChange(NoteBody.remove(body, item.index))}>
                        <Close fontSize="small"/>
                    </IconButton>
                </Tooltip>
            </Box>
        </Stack>
    );

    return (
        <Box data-testid="note">
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="overline">Note</Typography>
                <Stack direction="row">
                    <Tooltip title="Add a photo">
                        <IconButton size="small" component="label" disabled={busy} aria-label="Add a photo">
                            <AddPhotoAlternate fontSize="small"/>
                            <input hidden type="file" accept="image/*" data-testid="note-photo-input"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (file) void addPhoto(file);
                                }}/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit the note's text">
                        <IconButton size="small" aria-label="Edit note" onClick={() => {
                            setDraft(body ?? "");
                            setEditing(true);
                        }}><Edit fontSize="small"/></IconButton>
                    </Tooltip>
                </Stack>
            </Stack>
            {error && <Alert severity="warning" sx={{mb: 1}}>{error}</Alert>}
            {busy && <Typography variant="body2" color="text.secondary">Adding the photo…</Typography>}
            {blocks.length === 0 &&
                <Typography variant="body2" color="text.secondary"
                    sx={{cursor: "text"}} onClick={() => { setDraft(""); setEditing(true); }}>
                    Take a note…
                </Typography>}
            <Stack gap={1}>
                {groupBlocks(blocks).map(group => {
                    if (Array.isArray(group)) {
                        const open = group.filter(i => !i.checked);
                        const done = group.filter(i => i.checked);
                        return (
                            <Box key={`checks-${group[0].index}`}>
                                {open.map(checkItem)}
                                {done.length > 0 && open.length > 0 &&
                                    <Typography variant="caption" color="text.secondary" sx={{pl: 1}}>
                                        {done.length} checked
                                    </Typography>}
                                {done.map(checkItem)}
                            </Box>
                        );
                    }
                    if (group.kind === "image" && isSafeSrc(group.src)) {
                        return (
                            <Box key={group.index} sx={{position: "relative"}} data-testid="note-image">
                                <a href={group.src} target="_blank" rel="noopener noreferrer">
                                    <Box component="img" src={group.src} alt={group.alt} loading="lazy"
                                        sx={{display: "block", maxWidth: "100%", maxHeight: 360, borderRadius: 1}}/>
                                </a>
                                <IconButton size="small" aria-label="Remove photo"
                                    onClick={() => onChange(NoteBody.remove(body, group.index))}
                                    sx={{position: "absolute", top: 4, right: 4, bgcolor: "rgba(255,255,255,0.8)",
                                        "&:hover": {bgcolor: "rgba(255,255,255,0.95)"}}}>
                                    <Close fontSize="small"/>
                                </IconButton>
                            </Box>
                        );
                    }
                    if (group.kind === "text") {
                        return <Markdown key={group.index} text={group.text}/>;
                    }
                    if (group.kind === "image") {
                        return <Typography key={group.index} variant="body2" color="text.secondary">Photo: {group.alt || group.src}</Typography>;
                    }
                    return null;
                })}
            </Stack>
            <TextField
                size="small" fullWidth variant="standard" placeholder="+ List item" value={newItem}
                sx={{mt: 1}} inputProps={{"aria-label": "New list item", maxLength: 500}}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        addItem();
                    }
                }}
                onBlur={addItem}
            />
        </Box>
    );
}
