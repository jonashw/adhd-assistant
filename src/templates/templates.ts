import { HomeSymbol, MapScene, MindMap, MindMapGraphData, MindMapGraphLinkType, MindMapGraphNode, NodeStatus } from "../MindMap";

/* Starter maps for the "Help me pick" page. Each template is a small tree of places with notes,
   plus a walkthrough: a few typical edits played on a preview, so you see how the map is meant to be used. */

export type CrewLead = "tour" | "dog" | "spider" | "squirrel" | "sloth" | "rabbit" | "claude" | "review" | "none";

type PlaceSpec = {
    id: string,
    label: string,
    status?: NodeStatus,
    small?: boolean,
    note?: string,
    children?: PlaceSpec[]
};

export type WalkStep = {
    caption: string,
    /* the place this step is about, ringed on the preview */
    focus?: string,
    apply?: (graph: MindMapGraphData) => MindMapGraphData
};

export type StarterTemplate = {
    id: string,
    name: string,
    badge?: string,
    crew: CrewLead,
    pickWhen: string,
    teaches: string,
    keep: string,
    summary: string,
    why: string,
    pros: string[],
    cons: string[],
    graph: MindMapGraphData,
    walkthrough: WalkStep[]
};

function build(homeNote: string | undefined, places: PlaceSpec[], ties: {source: string, target: string, type: MindMapGraphLinkType}[] = []): MindMapGraphData {
    const nodes: MindMapGraphNode[] = [{id: "HOME", label: "HOME", type: "HOME", ...(homeNote ? {body: homeNote} : {})}];
    const links: MindMapGraphData["links"] = [];
    const walk = (spec: PlaceSpec, parent: string) => {
        nodes.push({
            id: spec.id,
            label: spec.label,
            type: "RabbitHole",
            origin: parent,
            ...(spec.status ? {status: spec.status} : {}),
            ...(spec.small ? {small: true} : {}),
            ...(spec.note ? {body: spec.note} : {})
        });
        links.push({source: spec.id, target: parent, type: "PART_OF"});
        spec.children?.forEach(c => walk(c, spec.id));
    };
    places.forEach(p => walk(p, "HOME"));
    return {nodes, links: [...links, ...ties]};
}

/* The view a map opens in: each starter map opens in the picture its places were written for */
const withScene = (graph: MindMapGraphData, scene: MapScene): MindMapGraphData => ({
    nodes: graph.nodes.map(n => n.type === "HOME" ? {...n, scene} : n),
    links: graph.links
});

/* The symbol a map's HOME wears in the graph view */
const withSymbol = (graph: MindMapGraphData, symbol: HomeSymbol): MindMapGraphData => ({
    nodes: graph.nodes.map(n => n.type === "HOME" ? {...n, symbol} : n),
    links: graph.links
});

/* A step that adds a place under another one */
const add = (id: string, label: string, under: string) => (graph: MindMapGraphData): MindMapGraphData => ({
    nodes: [...graph.nodes, {id, label, type: "RabbitHole", origin: under}],
    links: [...graph.links, {source: id, target: under, type: "PART_OF"}]
});
const status = (id: string, s: NodeStatus) => (graph: MindMapGraphData) => MindMap.setStatus(graph, id, s);
const then = (...fs: ((g: MindMapGraphData) => MindMapGraphData)[]) => (graph: MindMapGraphData) => fs.reduce((g, f) => f(g), graph);

export const starterTemplates: StarterTemplate[] = [
    {
        id: "first-day-out",
        name: "Base camp",
        badge: "Start here",
        crew: "tour",
        pickWhen: "\"How does this app work?\"",
        teaches: "The basics: places, walking, tying off and signals",
        keep: "Clear it once you've had the tour",
        summary: "A guided tour. HOME has three regions, Work, Home and Self, and every place's note teaches one thing you can do and introduces the crew member who helps with it.",
        why: "It's the only template that explains the scout picture, so you learn the app by using it instead of reading about it.",
        pros: [
            "Sets the tone and introduces the whole crew",
            "Every action is one you'll use on your real maps",
            "Ends with a checklist, so you finish the tour by doing"
        ],
        cons: [
            "The places are lessons, not your work, so you clear them afterwards",
            "It's the most to read of the six"
        ],
        graph: withScene(build(
            "HOME is Mindful. When nothing needs you, your crew curls up at your feet and the sloth hangs here at HOME. That's the goal, not a gap.\n\nOpen each place to read its note.",
            [
                {id: "work", label: "Work", children: [
                    {id: "chart", label: "Chart a new place", note: "Pick a place and add one under it. Your flying squirrel glides down and plants the stake. A new place is captured: seen, not yet visited."},
                    {id: "walk", label: "Walk somewhere", note: "When you start on a place, mark it active. That's walking there: your feet go where your head already went, and the dog trails a beat behind you."}
                ]},
                {id: "home-region", label: "Home", children: [
                    {id: "waiting", label: "Waiting on a reply", status: "waiting", note: "Waiting means it's out of your hands for now. It drops out of What's next until you pick it back up."},
                    {id: "hinges", label: "Buy hinges", small: true, note: "Small means the next step fits in 5 minutes. On a gusty day, What's next offers small things first."}
                ]},
                {id: "self", label: "Self", children: [
                    {id: "signals", label: "Signals", note: "Signals land at a place. A flag is a deadline, a flare is someone who needs you, smoke is trouble and fresh tracks are news. Your spider carries notes about them up your string."},
                    {id: "float", label: "Floating away", note: "Following a tangent floats your head away from where your feet are. That's fine. After a few steps out, the spider climbs your string and gives it a tug, with a note about what you set down.", children: [
                        {id: "float-1", label: "One thought leads to another", note: "Pick this cloud and your head floats up to it. The cloud lights up, and the ones you passed stay hooked on your string.", children: [
                            {id: "float-2", label: "And another", children: [
                                {id: "float-3", label: "Where was I?", note: "Four clouds up. Look down your string: every cloud it hooks is a step of the way back. Reel in to come down one at a time."}
                            ]},
                            {id: "float-side", label: "A side thought"}
                        ]}
                    ]},
                    {id: "done-here", label: "Mark this done", note: "- [x] Read the tour\n- [ ] Mark this place done and watch it tuck away\n- [ ] Clear the tour and chart your own map"}
                ]}
            ]
        ), "crew"),
        walkthrough: [
            {caption: "You open the map at HOME. Three regions, a few places, nothing started yet."},
            {caption: "Chart a place: add \"Call the dentist\" under Self. The squirrel plants a stake.", focus: "dentist", apply: add("dentist", "Call the dentist", "self")},
            {caption: "Walk there: mark \"Call the dentist\" active.", focus: "dentist", apply: status("dentist", "active")},
            {caption: "You left a message, so mark it waiting. It steps out of What's next until they call back.", focus: "dentist", apply: status("dentist", "waiting")},
            {caption: "Mark \"Mark this done\" done. It tucks away and the map gets lighter.", focus: "done-here", apply: status("done-here", "done")}
        ]
    },
    {
        id: "rabbit-hole",
        name: "Rabbit hole and back",
        crew: "rabbit",
        pickWhen: "\"I keep losing my way.\"",
        teaches: "Diving into a tangent and finding your way home",
        keep: "Dig your own holes in it, or keep it to show people",
        summary: "A chain of tangents you'll recognize: you set out to fix the sink and ended up donating bikes. The map is drawn as the rabbit's burrow: each place a chamber, each tangent a hole further down. You start five holes deep, and the string shows the way back.",
        why: "It shows the app's original promise in five seconds: however far you wander, you can always get home.",
        pros: [
            "Small, funny and relatable",
            "The best way to show someone else what the app is for",
            "Shows Blocked by: the sink waits on the wrench"
        ],
        cons: [
            "Mostly one deep branch, so it doesn't show regions or What's next",
            "It's a story, not a map you'd keep"
        ],
        graph: withScene(build(
            "This map is one afternoon of tangents. Start at \"Donate old bikes\" and look at the breadcrumbs.",
            [
                {id: "sink", label: "Fix the sink", status: "active", children: [
                    {id: "plumber", label: "Call a plumber?", status: "someday"},
                    {id: "wrench", label: "Need a wrench", note: "- [ ] Check the garage\n- [ ] Ask the neighbour", children: [
                        {id: "garage", label: "Garage is a mess", children: [
                            {id: "photos", label: "Box of old photos", note: "Found behind the bikes. Worth an evening, not this afternoon."},
                            {id: "reorg", label: "Reorganize garage", children: [
                                {id: "bikes", label: "Donate old bikes", note: "Five holes down from HOME. This is where your string starts to pull: you left \"Fix the sink\" up there a while ago."}
                            ]}
                        ]}
                    ]}
                ]},
                {id: "sam", label: "Reply to Sam"}
            ],
            [{source: "sink", target: "wrench", type: "BLOCKED_BY"}]
        ), "burrow"),
        walkthrough: [
            {caption: "You're at \"Donate old bikes\". Breadcrumbs: HOME › Fix the sink › Need a wrench › Garage is a mess › Reorganize garage.", focus: "bikes"},
            {caption: "Park the bikes for later: mark them someday.", focus: "bikes", apply: status("bikes", "someday")},
            {caption: "The garage deserves its own spot. Move \"Reorganize garage\" under HOME and mark it someday: it's a weekend, not this afternoon.", focus: "reorg", apply: then(g => MindMap.reparent(g, "reorg", "HOME"), status("reorg", "someday"))},
            {caption: "You found the wrench, so mark \"Need a wrench\" done. It tucks away with the passing thought under it, and the sink is no longer blocked.", focus: "wrench", apply: status("wrench", "done")},
            {caption: "Fix the sink and mark it done. You're home.", focus: "sink", apply: status("sink", "done")}
        ]
    },
    {
        id: "base-camp",
        name: "Check-in",
        crew: "dog",
        pickWhen: "\"Am I OK right now?\"",
        teaches: "Checking in on yourself: water, food, rest, people",
        keep: "Keep it and check in often",
        summary: "Water, food, movement, sleep, people and rest, each with one small way to check in with yourself. Nothing here is a chore list, and nothing here judges you.",
        why: "It puts your own needs on the map next to your work, which is the spirit of the whole app.",
        pros: [
            "Small and gentle, and worth keeping",
            "Every place is small, so it's always doable",
            "Pairs with a future voice check-in: \"How are you doing?\""
        ],
        cons: [
            "It teaches feelings more than features",
            "Places don't repeat yet, so you bring them back by hand"
        ],
        graph: withScene(build(
            "This map is for coming back to. The dog and the sloth live here: they're the crew's reminder to stop and notice.",
            [
                {id: "water", label: "Water", children: [{id: "glass", label: "Glass of water", small: true}]},
                {id: "food", label: "Food", children: [{id: "protein", label: "Something with protein", small: true}]},
                {id: "move", label: "Move", children: [{id: "block", label: "Walk around the block", small: true}]},
                {id: "sleep", label: "Sleep", children: [{id: "phone-out", label: "Phone out of the bedroom", small: true}]},
                {id: "people", label: "People", children: [{id: "text", label: "Text a friend", small: true}]},
                {id: "rest", label: "Rest", children: [{id: "scroll", label: "Scrolling, on purpose", small: true, note: "Scrolling counts as rest when you chose it. When it chose you, that's useful to know too, and nothing to feel bad about."}]}
            ]
        ), "crew"),
        walkthrough: [
            {caption: "It's 3pm and you haven't eaten. Look under Food.", focus: "protein"},
            {caption: "Mark \"Something with protein\" active while you eat.", focus: "protein", apply: status("protein", "active")},
            {caption: "Done. It tucks away until you bring it back tomorrow.", focus: "protein", apply: status("protein", "done")},
            {caption: "Scrolling on your phone? Mark it active. It's a signal, not a score.", focus: "scroll", apply: status("scroll", "active")}
        ]
    },
    {
        id: "gtd-review",
        name: "Weekly review",
        crew: "review",
        pickWhen: "\"I need to sort my pile.\"",
        teaches: "Sorting a pile into next steps, someday and done",
        keep: "Swap in your own pile and review it weekly",
        summary: "An inbox of captured items, two projects already moving, and a someday pile. The items already have statuses and a few are small, so What's next has something to rank on day one.",
        why: "You see What's next do its job right away instead of facing an empty screen.",
        pros: [
            "Fits a workflow you already know",
            "Uses statuses, the small flag and Hide Done",
            "Sorting the inbox is a real weekly habit to practise"
        ],
        cons: [
            "The buckets can teach the wrong habit: here a status belongs to a place, it isn't a folder",
            "The example items are someone else's life until you swap them"
        ],
        graph: withSymbol(build(
            "In this app a status lives on the place, not in a folder. Inbox is just a region to empty: as you sort, move each item to where it belongs and give it a status.",
            [
                {id: "inbox", label: "Inbox", children: [
                    {id: "vet", label: "Receipt from the vet", small: true},
                    {id: "pantry", label: "Idea: label the pantry"},
                    {id: "sam", label: "Email from Sam"}
                ]},
                {id: "projects", label: "Projects", children: [
                    {id: "trip", label: "Plan the trip", status: "active", children: [
                        {id: "flights", label: "Book flights", small: true},
                        {id: "dates", label: "Ask Sam about dates", status: "waiting"}
                    ]},
                    {id: "taxes", label: "Taxes", status: "active", children: [
                        {id: "return", label: "Find last year's return", small: true}
                    ]}
                ]},
                {id: "someday", label: "Someday", children: [
                    {id: "sail", label: "Learn to sail", status: "someday"},
                    {id: "shed", label: "Repaint the shed", status: "someday"}
                ]}
            ]
        ), "review"),
        walkthrough: [
            {caption: "Weekly review starts at Inbox: three captured items.", focus: "inbox"},
            {caption: "\"Receipt from the vet\" takes two minutes. Do it and mark it done.", focus: "vet", apply: status("vet", "done")},
            {caption: "\"Idea: label the pantry\" isn't for now. Move it to Someday.", focus: "pantry", apply: then(g => MindMap.reparent(g, "pantry", "someday"), status("pantry", "someday"))},
            {caption: "\"Email from Sam\" has the trip dates. Move it under the trip and mark \"Ask Sam about dates\" done.", focus: "sam", apply: then(g => MindMap.reparent(g, "sam", "trip"), status("dates", "done"))},
            {caption: "Inbox is empty. \"Book flights\" is small, so What's next offers it next.", focus: "flights"}
        ]
    },
    {
        id: "claude-projects",
        name: "My Claude projects",
        crew: "claude",
        pickWhen: "\"What's up with Claude?\"",
        teaches: "Seeing which Claude threads need you, and where",
        keep: "Keep it as your Claude map",
        summary: "Regions for your Claude work with a few places in each. When the connector is on, Claude threads check into places here, and their state shows up as signals at that stake.",
        why: "It sets up the navigator: one map that tells you which Claude thread needs you, without opening every one.",
        pros: [
            "Shows how threads, places and signals fit together",
            "A ready shape to rename into your real projects"
        ],
        cons: [
            "If you already have a Claude map, this mostly helps a fresh start",
            "Signals come from real threads, so the preview can only describe them"
        ],
        graph: build(
            "Claude threads check into places, never into a region. A thread that needs you raises a flare at its place, a finished one leaves fresh tracks and a stuck one sends up smoke.",
            [
                {id: "app", label: "App dev", children: [
                    {id: "mcp", label: "MCP server", status: "active"},
                    {id: "art", label: "Art", status: "active"},
                    {id: "bugs", label: "Bug fixes"}
                ]},
                {id: "job", label: "Work", children: [
                    {id: "report", label: "Quarterly report", status: "active"},
                    {id: "tickets", label: "Jira tickets"}
                ]},
                {id: "personal", label: "Personal", children: [
                    {id: "trip", label: "Trip planning"},
                    {id: "meals", label: "Meal ideas", status: "someday"}
                ]}
            ]
        ),
        walkthrough: [
            {caption: "Regions hold places. Claude threads check into places, like \"MCP server\".", focus: "mcp"},
            {caption: "A thread asks for a new place, \"Sign-in tokens\" under MCP server. You chart it.", focus: "tokens", apply: add("tokens", "Sign-in tokens", "mcp")},
            {caption: "The thread needs your review, so a flare goes up at \"Sign-in tokens\". Mark it active and go look.", focus: "tokens", apply: status("tokens", "active")},
            {caption: "You approve it and the thread finishes, leaving fresh tracks. Mark the place done.", focus: "tokens", apply: status("tokens", "done")}
        ]
    },
    {
        id: "blank-regions",
        name: "Blank map",
        crew: "none",
        pickWhen: "\"I know what I'm doing.\"",
        teaches: "Nothing, on purpose: HOME and a few empty regions",
        keep: "Make it yours",
        summary: "Four empty regions under HOME: Work, Home, Body and People. No notes, no examples.",
        why: "You want a little structure without a tour.",
        pros: [
            "Quick, and there's nothing to delete"
        ],
        cons: [
            "Barely more than Empty"
        ],
        graph: build(undefined, [
            {id: "work", label: "Work"},
            {id: "home-region", label: "Home"},
            {id: "body", label: "Body"},
            {id: "people", label: "People"}
        ]),
        walkthrough: [
            {caption: "Four empty regions."},
            {caption: "Chart your first place: \"Inbox\" under Work.", focus: "inbox", apply: add("inbox", "Inbox", "work")}
        ]
    }
];

/* The graph a walkthrough has reached after `step` steps */
export function graphAtStep(template: StarterTemplate, step: number): MindMapGraphData {
    return template.walkthrough.slice(0, step + 1).reduce((g, s) => s.apply ? s.apply(g) : g, template.graph);
}

/* A fresh copy of a template's map with new ids, ready to save as your own */
export function instantiate(template: StarterTemplate): MindMapGraphData {
    const ids = new Map(template.graph.nodes.map(n => [n.id, crypto.randomUUID()]));
    const id = (old: string | undefined) => old === undefined ? undefined : ids.get(old) ?? old;
    return {
        nodes: template.graph.nodes.map(n => ({...n, id: id(n.id)!, ...(n.origin ? {origin: id(n.origin)} : {})})),
        links: template.graph.links.map(l => ({...l, source: id(l.source)!, target: id(l.target)!}))
    };
}

export const placeCount = (template: StarterTemplate) => template.graph.nodes.length - 1;
