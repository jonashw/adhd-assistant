import { ArtifactFlag, ClaudeArtifact } from "./ClaudeMapTypes";
import { ago } from "./ClaudeMap";

/* How an artifact looks and opens on the Claude map, shared by the map, the list and the thread cards */

/* New is loud, Updated is warm, anything else just says how old it is */
export type Pill = {text: string, bg: string, fg: string, outline?: string};
export function artifactPill(artifact: ClaudeArtifact, flag: ArtifactFlag): Pill {
    const age = `Updated ${ago(artifact.updatedAt ?? artifact.firstSeenAt)}`;
    return flag === "new" ? {text: "New", bg: "#7C3AED", fg: "#FFFFFF"}
        : flag === "updated" ? {text: age, bg: "#F3E8FF", fg: "#5B21B6", outline: "#7C3AED"}
        : {text: age, bg: "#F3F4F6", fg: "#4B5563"};
}

/* An artifact always opens in the browser: the desktop app's claude:// links are only confirmed for threads */
export const artifactLinkProps = (url: string) => ({component: "a" as const, href: url, target: "_blank", rel: "noopener noreferrer"});

