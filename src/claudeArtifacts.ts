import { ArtifactFlag, ClaudeArtifact } from "./ClaudeMapTypes";
import { ago } from "./ClaudeMap";
import { ClaudeTokens } from "./theme";

/* How an artifact looks and opens on the Claude map, shared by the map, the list and the thread cards */

/* New is loud, Updated is warm, anything else just says how old it is */
/* Colours are names of theme tokens (palette.claude), so a pill follows light and dark */
type ColorToken = {[K in keyof ClaudeTokens]: ClaudeTokens[K] extends string ? K : never}[keyof ClaudeTokens];
export type Pill = {text: string, bg: ColorToken, fg: ColorToken | "white", outline?: ColorToken};
export const pillColor = (c: ClaudeTokens, token: ColorToken | "white") => token === "white" ? "#FFFFFF" : c[token];
export function artifactPill(artifact: ClaudeArtifact, flag: ArtifactFlag): Pill {
    const age = `Updated ${ago(artifact.updatedAt ?? artifact.firstSeenAt)}`;
    return flag === "new" ? {text: "New", bg: "artifact", fg: "white"}
        : flag === "updated" ? {text: age, bg: "artifactSoft", fg: "artifactText", outline: "artifact"}
        : {text: age, bg: "neutralPill", fg: "neutralPillText"};
}

/* An artifact always opens in the browser: the desktop app's claude:// links are only confirmed for threads */
export const artifactLinkProps = (url: string) => ({component: "a" as const, href: url, target: "_blank", rel: "noopener noreferrer"});

