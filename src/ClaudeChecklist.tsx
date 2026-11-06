import React from "react";
import { Alert, Box, Checkbox, IconButton, Link, Stack, Tooltip, Typography } from "@mui/material";
import { Close, OpenInNew } from "@mui/icons-material";
import { useNavigator } from "./NavigatorContext";
import { age, ChecklistItem } from "./TrailTypes";

/* To-dos Claude threads left for Jon at a place. Each names the thread that asked, with a link back to it.
   Jon checks them off here; a done one stays in view, struck through, for a week. */

function groupsOf(items: ChecklistItem[]): {group?: string, items: ChecklistItem[]}[] {
    const groups: {group?: string, items: ChecklistItem[]}[] = [];
    for (const item of items) {
        const existing = groups.find(g => g.group === item.group);
        if (existing) existing.items.push(item);
        else groups.push({group: item.group, items: [item]});
    }
    //items without a heading come first
    return groups.sort((a, b) => Number(a.group !== undefined) - Number(b.group !== undefined));
}

function Row({item}: {item: ChecklistItem}) {
    const nav = useNavigator();
    const [error, setError] = React.useState<string>();
    const done = item.doneAt !== undefined;
    const run = (work: Promise<void>) => work.then(() => setError(undefined)).catch((e: Error) => setError(e.message));
    return (
        <Box data-testid="checklist-item">
            <Stack direction="row" alignItems="flex-start" gap={0.5}>
                <Checkbox size="small" checked={done} sx={{p: 0.5}} inputProps={{"aria-label": item.text}}
                    onChange={e => run(nav.setChecklistDone(item.id, e.target.checked))}/>
                <Box sx={{flex: 1, minWidth: 0, pt: 0.5}}>
                    <Typography variant="body2" sx={{
                        overflowWrap: "anywhere",
                        textDecoration: done ? "line-through" : undefined,
                        color: done ? "text.secondary" : undefined
                    }}>
                        {item.text}
                        {item.link && <Tooltip title="Open where you do it">
                            <IconButton size="small" href={item.link} target="_blank" rel="noopener noreferrer" sx={{ml: 0.5, p: 0.25}}
                                aria-label={`Open the link for ${item.text}`}>
                                <OpenInNew sx={{fontSize: 14}}/>
                            </IconButton>
                        </Tooltip>}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                        From {item.thread.url
                            ? <Link href={item.thread.url} target="_blank" rel="noopener noreferrer">{item.thread.title}</Link>
                            : item.thread.title}
                        {" · "}{age(item.addedAt, nav.now)}
                        {done && item.doneBy === "claude" ? " · checked off by Claude" : ""}
                    </Typography>
                </Box>
                <Tooltip title="Remove">
                    <IconButton size="small" aria-label={`Remove ${item.text}`} onClick={() => run(nav.removeChecklistItem(item.id))}>
                        <Close fontSize="small"/>
                    </IconButton>
                </Tooltip>
            </Stack>
            {error && <Alert severity="warning" sx={{mt: 0.5}}>{error}</Alert>}
        </Box>
    );
}

export function ClaudeChecklist({items, title = "To do for you"}: {items: ChecklistItem[], title?: string}) {
    if (items.length === 0) {
        return null;
    }
    const open = items.filter(i => !i.doneAt).length;
    return (
        <Box data-testid="claude-checklist">
            {title && <Typography variant="overline">{title}{open > 0 ? ` (${open})` : ""}</Typography>}
            {groupsOf(items).map(g => (
                <Box key={g.group ?? ""}>
                    {g.group && <Typography variant="subtitle2" sx={{mt: 0.5}}>{g.group}</Typography>}
                    {g.items.map(item => <Row key={item.id} item={item}/>)}
                </Box>
            ))}
        </Box>
    );
}
