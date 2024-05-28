type Distance = number;
type GraphAdjacency = { [target: string]: Distance };
type Graph = { [source: string]: GraphAdjacency };

type PathSegment = {node: string; distance: Distance};

export function dijkstra(graph: Graph, start: string) {
    //origin: https://patrickkarsh.medium.com/dijkstras-shortest-path-algorithm-in-javascript-1621556a3a15
    //inspiration to retain node paths: https://stackoverflow.com/a/47615620/943730
    const nodes = Object.keys(graph);
    const distances: {[key:string]: number} = {};
    const shortestPathByTarget: {[key:string]: PathSegment[]} = {};
    const visited = new Set();

    // Initially, set the shortest distance to every node as Infinity
    for (const node of nodes) {
        distances[node] = Infinity;
    }
    
    // The distance from the start node to itself is 0
    distances[start] = 0;
    const segmentToSelf = {node:start, distance:0};
    shortestPathByTarget[start] = [segmentToSelf];

    function distanceTo(node: string): number {
        return node in shortestPathByTarget
        ? shortestPathByTarget[node].reduce((sum,segment) => sum + segment.distance, 0)
        : Infinity;
    }

    while (nodes.length) {
        nodes.sort((a, b) => distanceTo(a) - distanceTo(b));
        const closestTarget = nodes.shift()!;

        if (!(closestTarget in shortestPathByTarget)) {//remaining nodes are unreachable
            break;
        }

        visited.add(closestTarget);

        for (const targetOfTheTarget in graph[closestTarget]) {
            if (visited.has(targetOfTheTarget)) {
                continue;
            }
            const segmentToTargetOfTheTarget = {
                node: targetOfTheTarget,
                distance: graph[closestTarget][targetOfTheTarget]
            };
            if (distanceTo(closestTarget) + segmentToTargetOfTheTarget.distance < distanceTo(targetOfTheTarget)) {
                shortestPathByTarget[targetOfTheTarget] = [
                    ...shortestPathByTarget[closestTarget]
                    ,segmentToTargetOfTheTarget
                ];
                distances[targetOfTheTarget] = distanceTo(closestTarget) + segmentToTargetOfTheTarget.distance;
            }
        }
    }

    return {distances,shortestPathByTarget};
}