/* Cues on the live screen (design, Jon 2026-11-09): at a pause of 3 s or more, at most one a minute, a subtle chime plus
   the words on screen, so it still works with the phone in a pocket and AirPods in. Worded "Still open: …", never
   "missing". A "Cues" switch shows whether they're on; saying "quiet" turns them off and "cues on" back on. */

export const pauseMs = 3000;
export const cueGapMs = 60_000;

export type CueInput = {
    openNeeds: {id: string, text: string}[],
    thin: {id: string, text: string}[],
    rabbitHole: {nodeId: string, text: string, minutes: number, declared: boolean} | null,
    /* what was cued before, so the same words don't come back every minute */
    alreadyCued: Set<string>
};
export type Cue = {key: string, text: string, nodeId?: string, needId?: string};

/* The one cue worth giving now, or none. A rabbit hole Jon didn't declare comes first, once; then a still-open need;
   then a thin branch. */
export function pickCue({openNeeds, thin, rabbitHole, alreadyCued}: CueInput): Cue | null {
    if (rabbitHole && !rabbitHole.declared && rabbitHole.minutes >= 2) {
        const key = `rabbit:${rabbitHole.nodeId}`;
        if (!alreadyCued.has(key) && openNeeds.length > 0) {
            return {key, text: `Rabbit hole, ${rabbitHole.minutes} min. Back to the question?`, nodeId: rabbitHole.nodeId};
        }
    }
    const need = openNeeds.find(n => !alreadyCued.has(`need:${n.id}`));
    if (need) return {key: `need:${need.id}`, text: `Still open: ${need.text}`, needId: need.id};
    const branch = thin.find(t => !alreadyCued.has(`thin:${t.id}`));
    if (branch) return {key: `thin:${branch.id}`, text: `Say more about ${branch.text}?`, nodeId: branch.id};
    return null;
}

/* "quiet" turns cues off and "cues on" turns them back on; null when the stretch says neither */
export function spokenCueSwitch(text: string): boolean | null {
    if (/\b(cues? on|chimes? on|you can chime again)\b/i.test(text)) return true;
    // "quiet" only counts said on its own, so "it was quiet in the garage" doesn't switch anything
    if (/^\W*(ok(ay)?\W+)?(be |stay )?quiet( please| now)?\W*$/i.test(text.trim())) return false;
    if (/\b(cues? off|chimes? off|no more (cues|chimes))\b/i.test(text)) return false;
    return null;
}

let audio: AudioContext | undefined;

/* Browsers only start sound after a tap; call this from one so the first chime isn't silent */
export function unlockChime() {
    try {
        audio ??= new AudioContext();
        if (audio.state === "suspended") void audio.resume();
    } catch {
        // no Web Audio: cues stay on screen only
    }
}

/* Two soft sine notes, a fifth apart, quiet and short: noticeable in an earbud, easy to ignore */
export function chime() {
    try {
        audio ??= new AudioContext();
        const now = audio.currentTime;
        [659.25, 987.77].forEach((freq, i) => {
            const osc = audio!.createOscillator();
            const gain = audio!.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            const start = now + i * 0.14;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.06, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
            osc.connect(gain).connect(audio!.destination);
            osc.start(start);
            osc.stop(start + 0.65);
        });
    } catch {
        // no sound available; the cue still shows
    }
}
