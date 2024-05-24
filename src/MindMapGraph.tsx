import React from "react";
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d";
import { useContainerWidth } from "./useContainerWidth";
import { Breadcrumbs, Button, Card} from "@mui/material";
import { fillTextInsideCircle } from "./fillTextInsideCircle";
import { useUndo } from "./undo/useUndo";
import { UndoRedoToolbar } from "./undo/UndoRedoToolbar";
import { MindMap, MindMapGraphData, MindMapGraphNode, PathSegment} from "./MindMap";

type GraphRefType = 
    ForceGraphMethods<
    NodeObject<MindMapGraphNode>,
    LinkObject<MindMapGraphNode,object>>;

export default function MindMapGraph({
    value,
    height,
    onChange
}:{
    value:MindMapGraphData,
    height?: number,
    onChange: (value: MindMapGraphData) => void
}){
    const {availableWidth,containerRef} = useContainerWidth()
    const [pathHome,setPathHome] = React.useState<PathSegment[]>()
    const [graph,setGraph,undoController] = useUndo(value);
    React.useEffect(() => onChange(graph),[graph, onChange]);
    const graphRef = React.useRef<GraphRefType>();
    const [selectedNodeId, selectNodeId] = React.useState<string>();
    const selectedNode = React.useMemo(
        () => value.nodes.find(n => n.id === selectedNodeId),
        [selectedNodeId, value]);
    const clonedGraphData = React.useMemo(
        () => MindMap.clone(value),
        [value]);

    React.useEffect(() => {
        if(!value || !selectedNodeId){
            setPathHome(undefined);
            return;
        }
        const shortestPathHome = MindMap.shortestPathBetween(value, selectedNodeId, 'HOME');
        setPathHome(shortestPathHome);
    },[value, selectedNodeId, setPathHome]);

    React.useEffect(() => {
        graphRef.current?.d3ReheatSimulation();
    },[availableWidth]);

    React.useEffect(() => {
        //selectNodeId(value?.nodes[0]?.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[/*no dependencies so that we don't constantly reset a more useful selection when editing*/]);

    React.useEffect(() => {
        graphRef.current?.d3Force('charge')?.strength(-100);
    },[graphRef]);

    const nodeRadius = 15;

    const nodeForegroundColor = (node: MindMapGraphNode): string =>
        node.id === selectedNodeId
        ? 'white'
        : node.type === 'HOME'
            ? 'black'
            : 'white';

    const nodeColor = (node:MindMapGraphNode) =>
        node.id === selectedNodeId
        ? 'hsl(220 75 50)'
        : node.type === 'HOME'
            ? 'white'
            : 'hsl(0 0 30)';

    return (
        <div style={{position:'relative'}}>
            <Card elevation={1} sx={{
                position: 'absolute',
                width: '100%',
                zIndex: 1,
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 5

                }}>
                    <UndoRedoToolbar controller={undoController} />
                    <Button
                        variant="contained"
                        disabled={!selectedNode}
                        onClick={() => {
                            if (!selectedNode) {
                                return;
                            }
                            const nodeNum = value.nodes.length;
                            const label = prompt('Enter a name for the new rabbit hole', `Sub-topic #${nodeNum}`);
                            if (!label) {
                                return;
                            }
                            const newNode: MindMapGraphNode = {
                                id: crypto.randomUUID(),
                                label,
                                type: 'RabbitHole'
                            };
                            const updatedValue: MindMapGraphData = {
                                nodes: [...value.nodes, newNode],
                                links: [...value.links, {
                                    source: newNode.id,
                                    target: selectedNode.id,
                                    type: 'RETURNS_TO'
                                }]
                            };
                            setGraph(updatedValue);
                            selectNodeId(newNode.id);
                        }}
                    >
                        Deeper
                    </Button>
                    <Button
                        variant="contained"
                        color="warning"
                        disabled={!selectedNode}
                        onClick={() => {
                            if (!selectedNode) {
                                return;
                            }

                            selectNodeId(undefined);
                            setGraph(MindMap.remove(value, selectedNode));
                        }}
                    >
                        Remove
                    </Button>
                </div>
                {pathHome && (
                    <Breadcrumbs separator="&larr;" aria-label="breadcrumb" maxItems={4}>
                        {/* arrows: 🠄 🠈 🠘 🠚 🠙 🠛 🠜 🠞 🠝 🠟
                                */}
                        {[...pathHome].reverse().map((segment) => (
                            <Button key={segment.node.id} variant="text" onClick={() => {
                                selectNodeId(segment.node.id);
                            }}>
                                {segment.node.label}
                            </Button>
                        ))}
                    </Breadcrumbs>
                )}
            </Card>
                    
            <div ref={containerRef}>
                <ForceGraph2D
                    onNodeClick={node => selectNodeId(node.id)}
                    enablePanInteraction={false}
                    enableZoomInteraction={false}
                    onEngineTick={() => {
                        graphRef.current?.zoomToFit();
                    }}
                    graphData={clonedGraphData}
                    ref={graphRef}
                    height={height}
                    width={availableWidth}
                    nodeCanvasObjectMode={() => "after"}
                    nodeColor={nodeColor}
                    nodeRelSize={nodeRadius}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        fillTextInsideCircle(ctx, globalScale, node.x!, node.y!, nodeRadius, node.label, nodeForegroundColor(node));
                        ctx.beginPath();
                        ctx.arc(node.x!, node.y!, nodeRadius, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.strokeStyle = 'hsl(0 0 20)';
                        ctx.lineWidth = (node.type === 'HOME' ? 1 : 0.5) / globalScale;
                        ctx.stroke();
                    }}
                    /*
                    linkCanvasObjectMode={() => "after"}
                    linkCanvasObject={(link,ctx,globalScale) => {
                        ctx.save();
                        const fontSize = 12 / globalScale;
                        ctx.font = `${fontSize}px Sans-Serif`;
                        ctx.textAlign = 'center';
                        const label = link.type;
                        const metrics = ctx.measureText(label);
                        const h = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
                        const target = link.target! as any;
                        const source = link.source! as any;
                        const phi = Math.atan((target.y - source.y)/(target.x - source.x));
                        ctx.translate(
                            (target.x+source.x)/2,
                            (target.y+source.y)/2 + h/2);
                        ctx.rotate(phi);
                        ctx.fillText(label, 0,0);
                        ctx.restore();
                    }}
                    */
                    linkDirectionalArrowLength={nodeRadius / 3}
                    linkDirectionalArrowRelPos={() => 1}
                    cooldownTime={1000}
                    dagLevelDistance={25}
                    dagMode={"radialin"}
                />
            </div>
        </div>
    );
}