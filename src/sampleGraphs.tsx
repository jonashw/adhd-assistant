import { MindMapGraphDataRecord } from "./MindMap";

export const sampleGraphs: MindMapGraphDataRecord[] = [
    {
        id: 'e5972094-31e6-4749-b401-30c0f2b8acce',
        nodes: [
            { id: 'HOME', label: 'MINDFUL', type: 'HOME' },
            { id: '1', label: 'Subtopic #1', type: 'RabbitHole' },
            { id: '2', label: 'Subtopic #2', type: 'RabbitHole' },
            { id: '3', label: 'Subtopic #3', type: 'RabbitHole' },
        ],
        links: [
            { source: '1', target: 'HOME', type: 'RETURNS_TO' },
            { source: '2', target: 'HOME', type: 'RETURNS_TO' },
            { source: '3', target: 'HOME', type: 'RETURNS_TO' }
        ]
    }
];
