import { ClaudeArtifact, ClaudeProject, ClaudeThread, artifactsOf } from "./ClaudeMapTypes";

/* Search for "that thing on Monday about robots": words must all appear in what the map knows about a
   thread (title, topic, keywords, earlier topics, headline, project), and a day word (monday, yesterday,
   today) keeps threads that were started or active on that day in the last week. */

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayOf(word: string, now: Date): ((d: Date) => boolean) | undefined {
    const sameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (word === "today") {
        return d => sameDate(d, now);
    }
    if (word === "yesterday") {
        const y = new Date(now.getTime() - 864e5);
        return d => sameDate(d, y);
    }
    const index = weekdays.findIndex(w => word.length >= 3 && w.startsWith(word));
    if (index < 0) {
        return undefined;
    }
    return d => d.getDay() === index && now.getTime() - d.getTime() < 8 * 864e5;
}

export function threadText(thread: ClaudeThread, project: ClaudeProject): string {
    const card = thread.card;
    return [
        thread.title, card?.topic, ...(card?.keywords ?? []), ...(thread.pastTopics ?? []), card?.headline,
        card?.ask?.text, project.shortName, project.name, ...(thread.prs ?? []).map(p => `#${p.number} ${p.title}`),
        ...artifactsOf(thread, project).map(a => a.title)
    ].filter(Boolean).join(" ").toLowerCase();
}

/* An artifact matches when every word of the search is in its title (day words don't apply to it) */
export function artifactMatches(artifact: ClaudeArtifact, query: string): boolean {
    const words = searchWords(query).filter(w => !dayOf(w, new Date()));
    const title = artifact.title.toLowerCase();
    return words.length > 0 && words.every(word => title.includes(stem(word)));
}

// words shorter than 3 letters and filler like "that thing about" are left out
const searchWords = (query: string) => query.toLowerCase().split(/[^\p{L}\p{N}#]+/u).filter(w => w.length >= 3 && !filler.has(w));

export function matchesSearch(thread: ClaudeThread, project: ClaudeProject, query: string, now = new Date()): boolean {
    const words = searchWords(query);
    if (!words.length) {
        return true;
    }
    const text = threadText(thread, project);
    const dates = [thread.createdAt, thread.lastActivityAt].filter((d): d is string => !!d).map(d => new Date(d));
    return words.every(word => {
        const day = dayOf(word, now);
        if (day) {
            return dates.some(day);
        }
        return text.includes(stem(word));
    });
}

const filler = new Set([
    "the", "and", "that", "this", "thing", "things", "stuff", "about", "with", "was", "were", "what", "which",
    "had", "has", "have", "something", "for", "from", "working", "worked", "last", "some", "one", "where", "did", "are"
]);

/* "robots" finds "robot", "drawing" finds "draw" */
const stem = (word: string) => word.length > 4 ? word.replace(/(ing|s)$/, "") : word;
