import React from "react";
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d";
import { useContainerWidth } from "./useContainerWidth";
import { AppBar, Fab, Breadcrumbs, Button, Paper, Stack, Toolbar} from "@mui/material";
import { fillTextInsideCircle } from "./fillTextInsideCircle";
import { useUndo } from "./undo/useUndo";
import { UndoRedoToolbar } from "./undo/UndoRedoToolbar";
import { MindMap, MindMapGraphData, MindMapGraphNode, PathSegment} from "./MindMap";
import { CircularArray } from "./useCircularArray";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { ListenFab } from "./ListenFab";
type GraphRefType = 
    ForceGraphMethods<
    NodeObject<MindMapGraphNode>,
    LinkObject<MindMapGraphNode,object>>;

export default function MindMapGraph({
    value,
    height,
    onChange,
    homeImages
}:{
    value:MindMapGraphData,
    height?: number,
    onChange: (value: MindMapGraphData) => void,
    homeImages: CircularArray<HTMLImageElement>
}){
    //const {availableHeight,ontainerRef} = useContainerHeight();
    const {availableWidth,containerRef} = useContainerWidth()
    const [pathHome,setPathHome] = React.useState<PathSegment[]>()
    const [graph,setGraph,undoController] = useUndo(value);
    React.useEffect(() => onChange(graph),[graph, onChange]);
    const graphRef = React.useRef<GraphRefType>();
    const [selectedNodeId, selectNodeId] = React.useState<string>("HOME");
    const selectedNode = React.useMemo(
        () => value.nodes.find(n => n.id === selectedNodeId),
        [selectedNodeId, value]);
    const clonedGraphData = React.useMemo(
        () => MindMap.clone(value),
        [value]);

    const onSpeech = React.useCallback((result: string) => {
        if(result === "remove"){
            if(selectedNode){
                if(selectedNode.id === "HOME"){
                    alert('sorry, you may not remove HOME');
                } else {
                    setGraph(MindMap.remove(value, selectedNode));
                    selectNodeId("HOME");
                }
            } else {
                alert ('no node selected');
            }
        }
        if(result === "undo"){
            undoController.undo();
        }
        if(result === "redo"){
            undoController.redo();
        }
        if(result.indexOf('deeper') === 0){
            const label = result.replace(/^deeper/,'').trim();
            if(label.length === 0){
                alert('label not long enough');
                return;
            }
            const [updatedValue, newNode] = MindMap.rabbitHole(graph, selectedNodeId, label);
            setGraph(updatedValue);
            selectNodeId(newNode.id);
        }
    }, [ graph, selectedNode]);

    const { listeningStatus,  startListening, stopListening, transcript} =
        useSpeechRecognition({
            onRecognize: onSpeech,
            interimResults: false,
            maxAlternatives: 1,
            continuous: true
        });

    React.useEffect(() => {
        if(!transcript){
            return;
        }
    },[transcript]);

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
        node.type === 'HOME'
        ? 'black'
        : 'white';

    const nodeColor = (node:MindMapGraphNode) =>
        node.type === 'HOME'
        ? 'white'
        : node.id === selectedNodeId
        ? 'hsl(220 75 50)'
        : 'hsl(0 0 30)';

    return (
        <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
            <AppBar position="static" sx={{px:1}} enableColorOnDark>
                <Toolbar sx={{gap:1,p:0,justifyContent:'space-between'}}>
                    <Stack sx={{p:0}} gap={0.85} direction="row" justifyContent="space-between">
                        <UndoRedoToolbar controller={undoController} />
                    </Stack>

                    {selectedNode 
                    ? selectedNode.id === "HOME"
                    ? <div>

                    </div>
                    :
                    <Button
                        variant="contained"
                        color="error"
                        disabled={!selectedNode}
                        onClick={() => {
                            if (!selectedNode) {
                                return;
                            }

                            selectNodeId("HOME");
                            setGraph(MindMap.remove(value, selectedNode));
                        }}
                    >
                        Remove
                    </Button>
                    : <></>}
                    
                </Toolbar>
            </AppBar>
            
            {pathHome && pathHome.length > 1 && (
                <Breadcrumbs separator="&larr;" aria-label="breadcrumb">
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
            <Paper elevation={0}>
                <div ref={containerRef}>
                    {homeImages.currentItem && <ForceGraph2D
                        onNodeClick={node => {
                            if (selectedNodeId === 'HOME' && node.id === 'HOME') {
                                homeImages.next();
                            } else {
                                selectNodeId(node.id);
                            }
                        }}
                        onBackgroundClick={() => {
                            selectNodeId('HOME');
                        }}
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
                            if (node.id === 'HOME') {
                                //
                                ctx.save();
                                const side = nodeRadius * 1.9;
                                ctx.translate(node.x! - side / 2, node.y! - side / 2);
                                ctx.globalCompositeOperation = "darken";
                                const homeImg = homeImages.currentItem;
                                if (homeImg) {
                                    ctx.drawImage(
                                        homeImg,
                                        0, 0,
                                        homeImg.width, homeImg.height,
                                        0, 0,
                                        side, side);
                                }
                                ctx.restore();
                            } else {
                                fillTextInsideCircle(ctx, globalScale, node.x!, node.y!, nodeRadius, node.label, nodeForegroundColor(node));
                                ctx.beginPath();
                                ctx.arc(node.x!, node.y!, nodeRadius, 0, Math.PI * 2);
                                ctx.closePath();
                                ctx.strokeStyle = 'hsl(0 0 20)';
                                ctx.lineWidth = (node.type === 'HOME' ? 1 : 0.5) / globalScale;
                                ctx.stroke();
                            }
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
                    />}
                    <Stack direction={"row-reverse"} gap={2} alignItems={"center"}

                            sx={{ position: 'fixed', right: '1em', bottom: '1em'}}
                    >
                        <Fab
                            variant="extended"
                            color={"info"}
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
                                const [updatedValue, newNode] = MindMap.rabbitHole(value, selectedNode.id, label);
                                setGraph(updatedValue);
                                selectNodeId(newNode.id);
                            }}
                        >
                            Deeper
                        </Fab>

                        <ListenFab status={listeningStatus} start={startListening} stop={stopListening} />
                    </Stack>
                </div>
            </Paper>
        </div>
    );
}