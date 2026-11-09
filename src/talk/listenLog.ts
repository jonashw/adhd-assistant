/* A saved log from the Android listen test (PR #49): one line per event, "+12.3s segment: words". Each segment is a
   stretch the recogniser committed at a pause, so playing them back at their times stands in for the phone. */

export type LoggedStretch = {atMs: number, text: string};

export function parseListenLog(log: string): LoggedStretch[] {
    const stretches: LoggedStretch[] = [];
    for (const line of log.split(/\r?\n/)) {
        const m = /^\+(\d+(?:\.\d+)?)s\s+(?:segment|final):\s*(.*)$/.exec(line.trim());
        if (m && m[2].trim()) {
            stretches.push({atMs: Math.round(Number(m[1]) * 1000), text: m[2].trim()});
        }
    }
    return stretches;
}
