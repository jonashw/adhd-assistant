import { MindMapGraphData } from "../MindMap";

/* A small map to show the burrow off: two places under HOME, tangents under each, one of them deep */
export const burrowDemoGraph: MindMapGraphData = {
    nodes: [
        {id: "HOME", label: "HOME", type: "HOME"},
        {id: "sink", label: "Fix the sink", type: "RabbitHole", status: "active"},
        {id: "sam", label: "Reply to Sam", type: "RabbitHole"},
        {id: "receipt", label: "Find receipt", type: "RabbitHole", status: "done"},
        {id: "wrench", label: "Need a wrench", type: "RabbitHole", body: "- [ ] Check the garage\n- [ ] Ask the neighbour"},
        {id: "plumber", label: "Call a plumber", type: "RabbitHole", status: "someday"},
        {id: "garage", label: "Garage is a mess", type: "RabbitHole"},
        {id: "photos", label: "Old photos", type: "RabbitHole", status: "active", body: "Found a box of them behind the bikes.\n![Grandpa fishing](https://example.invalid/fishing.jpg)"},
        {id: "bikes", label: "Donate bikes", type: "RabbitHole"}
    ],
    links: [
        {source: "sink", target: "HOME", type: "PART_OF"},
        {source: "sam", target: "HOME", type: "PART_OF"},
        {source: "wrench", target: "sink", type: "PART_OF"},
        {source: "receipt", target: "sam", type: "PART_OF"},
        {source: "plumber", target: "sink", type: "PART_OF"},
        {source: "garage", target: "wrench", type: "PART_OF"},
        {source: "photos", target: "garage", type: "PART_OF"},
        {source: "bikes", target: "garage", type: "PART_OF"}
    ]
};
