import { ClaudeTodo, DelayClass, InterestAnswer, InterestGuess, TodoSize } from "./ClaudeMapTypes";

/* Leverage: the order Your move puts Jon's to-dos and asks in.

   Leverage = (urgency of its delay class + its worth + the value waiting on it) × interest ÷ size

   It is Reinertsen's CD3 (cost of delay ÷ duration), with one addition Jon asked for: an item's cost of delay includes
   everything waiting on it. Value flows back along waits_on, in full one step back and halving each step after, and a
   to-do that several others wait on shares their value between it and their other open waits. A Claude thread
   waiting on Jon adds worth, because what it delivers reaches him later. Missing estimates count as middling. */

export type LeverageInput = {
    id: string,
    worth?: 1 | 2 | 3,
    size?: TodoSize,
    delayClass?: DelayClass,
    dueOn?: string,
    waitsOn?: string[],
    interest?: {guess: InterestGuess, answer?: InterestAnswer},
    /* a Claude thread is waiting on this (an ask), so finishing it sets work going */
    claudeWaits?: boolean
};

export const claudeWaitWorth = 2;

const sizeFactor: Record<TodoSize, number> = {minutes: 1, half_hour: 2, longer: 4};

/* urgency of a delay class, on the same scale as worth. A fixed date climbs as the day comes near. */
export function urgency(delayClass: DelayClass = "standard", dueOn?: string, now = Date.now()): number {
    switch (delayClass) {
        case "expedite": return 4;
        case "intangible": return 0;
        case "standard": return 1;
        case "fixed_date": {
            const days = dueOn ? (Date.parse(`${dueOn}T23:59:59`) - now) / 864e5 : Infinity;
            return days <= 2 ? 4 : days <= 7 ? 2 : 1;
        }
    }
}

/* Jon's answer counts in full; Claude's guess counts for half until he gives one */
export function interestFactor(interest?: LeverageInput["interest"]): number {
    const full = interest?.answer === "up" ? 1.4 : interest?.answer === "down" ? 0.6
        : interest?.guess === "drawn" ? 1.4 : interest?.guess === "reluctant" ? 0.6 : 1;
    return interest?.answer ? full : 1 + (full - 1) / 2;
}

export type Scored = {leverage: number, opens: number, ready: boolean};

export function scoreAll(items: LeverageInput[], now = Date.now()): Map<string, Scored> {
    const open = new Map(items.map(i => [i.id, i]));
    const openWaits = (i: LeverageInput) => (i.waitsOn ?? []).filter(id => open.has(id) && id !== i.id);
    const dependents = new Map<string, LeverageInput[]>();
    items.forEach(i => openWaits(i).forEach(w => dependents.set(w, [...(dependents.get(w) ?? []), i])));
    const own = (i: LeverageInput) => urgency(i.delayClass, i.dueOn, now) + (i.worth ?? 2) + (i.claudeWaits ? claudeWaitWorth : 0);
    // the value waiting on an item: each dependent's own value, shared among its open waits, plus half of what waits on it
    const opensValue = (i: LeverageInput, seen: Set<string>): number => (dependents.get(i.id) ?? [])
        .filter(d => !seen.has(d.id))
        .reduce((sum, d) => sum + (own(d) + 0.5 * opensValue(d, new Set([...seen, d.id]))) / Math.max(1, openWaits(d).length), 0);
    return new Map(items.map(i => [i.id, {
        leverage: (own(i) + opensValue(i, new Set([i.id]))) * interestFactor(i.interest) / sizeFactor[i.size ?? "half_hour"],
        opens: dependents.get(i.id)?.length ?? 0,
        ready: openWaits(i).length === 0
    }]));
}

const sizeWords: Record<TodoSize, string> = {minutes: "a few minutes", half_hour: "about half an hour", longer: "longer"};

/* The one-line reason the page shows instead of the number: "a few minutes · opens 2 · a Claude thread waits" */
export function reasonLine(todo: Pick<ClaudeTodo, "size" | "delayClass" | "dueOn"> & {claudeWaits?: boolean}, scored?: Scored): string {
    return [
        todo.size && sizeWords[todo.size],
        scored?.opens ? `opens ${scored.opens}` : undefined,
        todo.claudeWaits && "a Claude thread waits",
        todo.delayClass === "expedite" && "urgent",
        todo.delayClass === "fixed_date" && todo.dueOn && `by ${todo.dueOn}`,
        scored && !scored.ready && "waits on another to-do"
    ].filter(Boolean).join(" · ");
}
