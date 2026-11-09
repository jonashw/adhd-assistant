/* What Jon is focused on right now, for Your move.

   Domains are the big necks of the woods: Personal and Work to start (a second employer would be a second work
   domain). Every Claude project belongs to one; a project nobody filed counts as Personal. Later, work items that
   don't live in Claude (enterprise GitHub issues, Jira tickets) join the same domains, so one Leverage order covers
   both halves of his life.

   Two knobs, both on Your move, both wearing off overnight so a filter left on yesterday never hides today's work:
   - Mode leans the order toward one domain kind. "Mixed mode" is the plain Leverage order; "Mostly work mode" lifts work
     items and sinks personal ones; "Work mode" all but parks personal items at the bottom of Ready. Nothing is hidden.
   - Focus narrows Your move to one domain or one project. Start here and Ready are then worked out from that slice
     alone, by the same model, so hyperfocusing on a project still gets a key and two alternates. */

import { ClaudeProject } from "./ClaudeMapTypes";

export const domainKinds = ["personal", "work"] as const;
export type DomainKind = typeof domainKinds[number];

export type Domain = {
    id: string,
    name: string,
    kind: DomainKind,
    position: number
};

/* The share of Jon that is at work right now, in quarter steps */
export const workShares = [0, 0.25, 0.5, 0.75, 1] as const;
export type WorkShare = typeof workShares[number];
export const modeNames: Record<WorkShare, string> = {
    0: "Personal mode",
    0.25: "Mostly personal mode",
    0.5: "Mixed mode",
    0.75: "Mostly work mode",
    1: "Work mode"
};

export type FocusScope = {kind: "domain" | "project", id: string};

export type Focus = {
    workShare: WorkShare,
    scope?: FocusScope,
    setAt: string,
    /* when it wears off */
    until: string
};

export const defaultDomains: Domain[] = [
    {id: "personal", name: "Personal", kind: "personal", position: 0},
    {id: "work", name: "Work", kind: "work", position: 1}
];

/* The focus that holds now: a worn-off one is no focus at all */
export const currentFocus = (focus: Focus | undefined, now = Date.now()) =>
    focus && Date.parse(focus.until) > now ? focus : undefined;

export const asWorkShare = (n: unknown): WorkShare =>
    workShares.find(s => s === n) ?? 0.5;

/* A focus lasts the day: it wears off at 4 in the morning, Jon's time */
export function focusUntil(now = new Date()): Date {
    const until = new Date(now);
    until.setHours(4, 0, 0, 0);
    if (until.getTime() <= now.getTime()) until.setDate(until.getDate() + 1);
    return until;
}

/* The domain a project belongs to; unfiled projects are Personal */
export function domainOf(domains: Domain[], project: ClaudeProject): Domain {
    return domains.find(d => d.id === project.domainId)
        ?? domains.find(d => d.kind === "personal")
        ?? defaultDomains[0];
}

/* How much the mode lifts or sinks an item's Leverage: 1 in mixed mode, up to 2 for the side Jon leans to,
   down to a tenth for the other side, so it sinks to the bottom without vanishing */
export function modeWeight(kind: DomainKind, workShare: WorkShare): number {
    const share = kind === "work" ? workShare : 1 - workShare;
    return Math.max(0.1, 2 * share);
}

export function inScope(domains: Domain[], project: ClaudeProject, scope?: FocusScope): boolean {
    if (!scope) return true;
    return scope.kind === "project" ? project.id === scope.id : domainOf(domains, project).id === scope.id;
}

/* "ADHD Support (App)", "Work", or undefined for everything */
export function scopeName(domains: Domain[], projects: ClaudeProject[], scope: FocusScope | undefined,
    projectName: (p: ClaudeProject) => string): string | undefined {
    if (!scope) return undefined;
    if (scope.kind === "domain") return domains.find(d => d.id === scope.id)?.name;
    const project = projects.find(p => p.id === scope.id);
    return project ? projectName(project) : undefined;
}
