import React from "react";

/* A fidget is one small move a crew member makes now and then: a blink, an ear flick, a dart */
export type Fidget = {name: string, ms: number, weight?: number};

const reducedQuery = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion() {
    const [reduced, setReduced] = React.useState(() =>
        typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(reducedQuery).matches);
    React.useEffect(() => {
        if (!window.matchMedia) return;
        const query = window.matchMedia(reducedQuery);
        const onChange = () => setReduced(query.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);
    return reduced;
}

/* Plays one fidget at a time, after a random pause, so no two crew members ever move in step.
   Returns the fidget playing now (as a class name for the drawing), or undefined while still. */
export function useFidget(fidgets: Fidget[], gapMs: [number, number], enabled = true): string | undefined {
    const [current, setCurrent] = React.useState<string>();
    const reduced = usePrefersReducedMotion();
    const list = React.useRef(fidgets);
    list.current = fidgets;
    const [lo, hi] = gapMs;

    React.useEffect(() => {
        if (!enabled || reduced || list.current.length === 0) {
            setCurrent(undefined);
            return;
        }
        let timer: number;
        const schedule = () => {
            timer = window.setTimeout(play, lo + Math.random() * (hi - lo));
        };
        const play = () => {
            const options = list.current;
            const total = options.reduce((sum, f) => sum + (f.weight ?? 1), 0);
            let roll = Math.random() * total;
            const pick = options.find(f => (roll -= f.weight ?? 1) < 0) ?? options[0];
            setCurrent(pick.name);
            timer = window.setTimeout(() => {
                setCurrent(undefined);
                schedule();
            }, pick.ms);
        };
        schedule();
        return () => window.clearTimeout(timer);
    }, [enabled, reduced, lo, hi]);

    return current;
}
