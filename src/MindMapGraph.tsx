import React from "react";
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d";
import { useContainerWidth } from "./useContainerWidth";
import { Fab, Breadcrumbs, Button, Paper, Stack} from "@mui/material";
import { fillTextInsideCircle } from "./fillTextInsideCircle";
import { useUndo } from "./undo/useUndo";
import { MindMap, MindMapGraphData, MindMapGraphNode, PathSegment} from "./MindMap";
import { CircularArray } from "./useCircularArray";
import { Transcript, useSpeechRecognition } from "./useSpeechRecognition";
import { ListenFab } from "./ListenFab";
import { MultiModalPrompt } from "./MultiModalPrompt";
import { GraphNodeClickMode, MindMapEditorToolbar } from "./MindMapEditorToolbar";
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
    value: MindMapGraphData,
    height?: number,
    onChange: (value: MindMapGraphData) => void,
    homeImages: CircularArray<HTMLImageElement>
}){
    //const {availableHeight,ontainerRef} = useContainerHeight();

    const [nodeClickMode,setNodeClickMode] = React.useState<GraphNodeClickMode>("select");
    const {availableWidth,containerRef} = useContainerWidth()
    const [pathHome,setPathHome] = React.useState<PathSegment[]>()
    const [graph,setGraph,undoController] = useUndo(value);
    React.useEffect(() => onChange(graph),[graph, onChange]);
    const graphRef = React.useRef<GraphRefType>();
    const [selectedNodeId, selectNodeId] = React.useState<string>("HOME");
    const [rabbitHoleModalVisible, setRabbitHoleModalVisible] = React.useState<boolean>(false);
    const selectedNode = React.useMemo(
        () => value.nodes.find(n => n.id === selectedNodeId),
        [selectedNodeId, value]);
    const clonedGraphData = React.useMemo(
        () => MindMap.clone(value),
        [value]);

    const utilizeNativePrompt = false;

    const nextDefaultNodeName = React.useMemo(() => {
        const nodeNum = value.nodes.length;
        return `Sub-topic #${nodeNum}`;
    },[value.nodes.length]);

    const guideUserDeeper = () => {
        if (!selectedNode) {
            return;
        }
        if(!utilizeNativePrompt){
            setRabbitHoleModalVisible(true);
            return;
        }
        const label = prompt('Enter a name for the new rabbit hole', nextDefaultNodeName);
        if (!label) {
            return;
        }
        const [updatedValue, newNode] = MindMap.rabbitHole(value, selectedNode.id, label);
        setGraph(updatedValue);
        selectNodeId(newNode.id);
    };

    const tryRabbitHole = (newRabbitHoleName?: string) => {
        if(!selectedNode || !newRabbitHoleName){
            return;
        }
        const [updatedValue, newNode] = MindMap.rabbitHole(value, selectedNode.id, newRabbitHoleName);
        setGraph(updatedValue);
        selectNodeId(newNode.id);
        setRabbitHoleModalVisible(false);
    }


    const onSpeech = React.useCallback((result: Transcript) => {
        if(!result.isFinal){
            return;
        }
        if(result.value === "remove"){
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
        if(result.value === "undo"){
            undoController.undo();
        }
        if(result.value === "redo"){
            undoController.redo();
        }
        if(result.value.indexOf('deeper') === 0){
            const label = result.value.replace(/^deeper/,'').trim();
            if(label.length === 0){
                alert('label not long enough');
                return;
            }
            const [updatedValue, newNode] = MindMap.rabbitHole(graph, selectedNodeId, label);
            setGraph(updatedValue);
            selectNodeId(newNode.id);
        }
    }, [ graph, selectedNode]);

    const { listeningStatus, startListening, stopListening, transcript} =
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
            <MindMapEditorToolbar 
                value={value}
                onChange={setGraph}
                nodeClickMode={nodeClickMode}
                setNodeClickMode={setNodeClickMode}
                selectNodeId={selectNodeId}
                selectedNode={selectedNode}
                undoController={undoController}
            />
            
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
            {rabbitHoleModalVisible && <MultiModalPrompt
                title={"Go Down a Rabbit Hole"}
                defaultValue={nextDefaultNodeName}
                open={rabbitHoleModalVisible}
                instructions="Name the rabbit hole you wish to go down"
                label={"Name"}
                onClose={(newRabbitHoleName?: string) => {
                    tryRabbitHole(newRabbitHoleName);
                    setRabbitHoleModalVisible(false);
                }}
            />}
            <Paper elevation={0}>
                <div ref={containerRef}>
                    {homeImages.currentItem && <ForceGraph2D
                        onNodeClick={node => {
                            if (selectedNodeId === 'HOME' && node.id === 'HOME') {
                                //homeImages.next();
                            } else {
                                switch(nodeClickMode){
                                    case "select": {
                                        selectNodeId(node.id);
                                        break;
                                    }
                                    case "re-parent": {
                                        if(!selectNodeId){
                                            alert('cannot perform re-parenting without a selected node');
                                        } else {
                                            setGraph(MindMap.reparent(graph,selectedNodeId,node.id));
                                            setNodeClickMode('select');
                                        }
                                        break;
                                    }
                                    default: {
                                        alert(`unexpected click mode: ${nodeClickMode}`)
                                    }

                                }
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
                                const homeImg = homeImages.currentItem;
                                if (homeImg) {
                                    ctx.translate(node.x! - side / 2, node.y! - side / 2);
                                    ctx.globalCompositeOperation = "darken";
                                    ctx.drawImage(
                                        homeImg,
                                        0, 0,
                                        homeImg.width, homeImg.height,
                                        0, 0,
                                        side, side);
                                } else {
                                    ctx.beginPath();
                                    ctx.arc(node.x!, node.y!, nodeRadius, 0, Math.PI * 2);
                                    ctx.closePath();
                                    ctx.strokeStyle = 'hsl(0 0 20)';
                                    ctx.lineWidth = (node.type === 'HOME' ? 1 : 0.5) / globalScale;
                                    ctx.stroke();
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
                            const textThresholdAngle = (0/4) * Math.PI;
                            let textRotationAngle = phi + (phi < textThresholdAngle ? -1 : 1) * Math.PI/2;
                            if(textRotationAngle <= Math.PI){
                                //console.log('<90',label);
                                textRotationAngle -= Math.PI;
                            }
                            ctx.rotate(textRotationAngle);
                            ctx.fillText(label, 0,0);
                            ctx.restore();
                        }}
                        linkDirectionalArrowLength={nodeRadius / 3}
                        linkDirectionalArrowRelPos={() => 1}
                        linkWidth={5}
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
                            onClick={guideUserDeeper}
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