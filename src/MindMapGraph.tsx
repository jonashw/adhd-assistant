import React from "react";
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d";
import { useElementSize } from "./useContainerWidth";
import { Fab, Breadcrumbs, Button, Paper, Stack} from "@mui/material";
import { fillTextInsideCircle } from "./fillTextInsideCircle";
import { useUndo } from "./undo/useUndo";
import { MindMap, MindMapGraphData, MindMapGraphNode, PathSegment} from "./MindMap";
import { Transcript, useSpeechRecognition } from "./useSpeechRecognition";
import { ListenFab } from "./ListenFab";
import { MultiModalPrompt } from "./MultiModalPrompt";
import { GraphNodeClickMode, MindMapEditorToolbar } from "./MindMapEditorToolbar";
import { loadImgElement } from "./loadImgElement";
type GraphRefType = 
    ForceGraphMethods<
    NodeObject<MindMapGraphNode>,
    LinkObject<MindMapGraphNode,object>>;

export default function MindMapGraph({
    value,
    onChange,
}:{
    value: MindMapGraphData,
    onChange: (value: MindMapGraphData) => void,
}){
    //const {availableHeight,ontainerRef} = useContainerHeight();
    const [nodeClickMode,setNodeClickMode] = React.useState<GraphNodeClickMode>("select");
    const [headerSize,headerRef] = useElementSize();
    const [breadCrumbsSize,breadCrumbsRef] = useElementSize();
    const [homeImage,setHomeImage] = React.useState<HTMLImageElement>();

    const height = React.useMemo(() => window.innerHeight - (headerSize.height + breadCrumbsSize.height), [
        headerSize, breadCrumbsSize
    ]);
    const width = window.innerWidth;

    const [pathHome,setPathHome] = React.useState<PathSegment[]>()
    const [graph,setGraph,undoController] = useUndo(value,onChange);
    const change = React.useCallback((updatedGraph: MindMapGraphData) => {
        setGraph(updatedGraph);
        onChange(updatedGraph);
    },[graph,onChange]);
    const graphRef = React.useRef<GraphRefType>();
    const home = graph.nodes.find(n => n.type === "HOME");
    const [selectedNodeId, selectNodeId] = React.useState<string | undefined>(home?.id);
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

        console.log('added rabbit hole');
        change(updatedValue);
        selectNodeId(newNode.id);
    };

    const tryRabbitHole = (newRabbitHoleName?: string) => {
        if(!selectedNode || !newRabbitHoleName){
            return;
        }
        const [updatedValue, newNode] = MindMap.rabbitHole(value, selectedNode.id, newRabbitHoleName);
        console.log('rabbit hole');
        change(updatedValue);
        selectNodeId(newNode.id);
        setRabbitHoleModalVisible(false);
    }

    const onSpeech = React.useCallback((result: Transcript) => {
        if(!result.isFinal){
            return;
        }
        if(result.value === "remove"){
            if(selectedNode){
                if(selectedNode.type === "HOME"){
                    alert('sorry, you may not remove HOME');
                } else {
                    console.log('removed node',selectedNode);
                    change(MindMap.remove(value, selectedNode));
                    const home = value.nodes.find(n => n.type === "HOME");
                    selectNodeId(home?.id);
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
            if(!selectedNodeId){
                alert('cannot go deeper without a selected node');
                return;
            }
            if(label.length === 0){
                alert('label not long enough');
                return;
            }
            const [updatedValue, newNode] = MindMap.rabbitHole(graph, selectedNodeId, label);
            console.log('deeper by voice',newNode);
            change(updatedValue);
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
        if(!value || !selectedNodeId || !home){
            setPathHome(undefined);
            return;
        }
        const shortestPathHome = MindMap.shortestPathBetween(value, selectedNodeId, home.id);
        setPathHome(shortestPathHome);
    },[value, selectedNodeId, setPathHome]);

    React.useEffect(() => {
        loadImgElement('/enso-circle.jpg').then(setHomeImage);
    },[]);

    React.useEffect(() => {
        graphRef.current?.d3ReheatSimulation();
    },[width]);

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
        <div style={{display:'flex',flexDirection:'column',height:'100dvh'}}>
            <div ref={headerRef}>
                <MindMapEditorToolbar 
                    value={value}
                    nodeClickMode={nodeClickMode}
                    setNodeClickMode={setNodeClickMode}
                    selectNodeId={selectNodeId}
                    selectedNode={selectedNode}
                    undoController={undoController}
                    onChange={change}
                />
            </div>

            <div ref={breadCrumbsRef}>
                {pathHome && pathHome.length > 1 && (
                    <Breadcrumbs separator="&larr;" aria-label="breadcrumb">
                        {/* arrows: 🠄 🠈 🠘 🠚 🠙 🠛 🠜 🠞 🠝 🠟 */}
                        {[...pathHome].reverse().map((segment) => (
                            <Button key={segment.node.id} variant="text" onClick={() => {
                                selectNodeId(segment.node.id);
                            }}>
                                {segment.node.label}
                            </Button>
                        ))}
                    </Breadcrumbs>
                )}
            </div>

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
                <div>
                    {homeImage && <ForceGraph2D
                        onNodeClick={node => {
                            if (selectedNode?.type === 'HOME' && node.type === 'HOME') {
                                //homeImages.next();
                            } else {
                                switch(nodeClickMode){
                                    case "select": {
                                        selectNodeId(node.id);
                                        break;
                                    }
                                    case "re-parent": {
                                        if(!selectedNodeId){
                                            alert('cannot perform re-parenting without a selected node');
                                        } else {

                                            console.log('reparented node',selectedNodeId);
                                            change(MindMap.reparent(graph,selectedNodeId,node.id));
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
                            selectNodeId(undefined);
                        }}
                        enablePanInteraction={false}
                        enableZoomInteraction={false}
                        onEngineTick={() => {
                            graphRef.current?.zoomToFit();
                        }}
                        graphData={clonedGraphData}
                        ref={graphRef}
                        height={height}
                        width={width}
                        nodeCanvasObjectMode={() => "after"}
                        nodeColor={nodeColor}
                        nodeRelSize={nodeRadius}
                        nodeCanvasObject={(node, ctx, globalScale) => {
                            if (node.type === 'HOME') {
                                //
                                if (homeImage) {
                                    ctx.save();
                                    const side = nodeRadius * 1.9;
                                    ctx.translate(node.x! - side / 2, node.y! - side / 2);
                                    ctx.globalCompositeOperation = "darken";
                                    ctx.drawImage(
                                        homeImage,
                                        0, 0,
                                        homeImage.width, homeImage.height,
                                        0, 0,
                                        side, side);
                                    ctx.restore();
                                } else {
                                    ctx.save();
                                    ctx.beginPath();
                                    ctx.arc(node.x!, node.y!, nodeRadius, 0, Math.PI * 2);
                                    ctx.closePath();
                                    ctx.strokeStyle = 'hsl(0 0 20)';
                                    ctx.lineWidth = (node.type === 'HOME' ? 1 : 0.5) / globalScale;
                                    ctx.stroke();
                                    ctx.restore();
                                }
                            } else {
                                fillTextInsideCircle(ctx, globalScale, node.x!, node.y!, nodeRadius, node.label, nodeForegroundColor(node));
                                ctx.beginPath();
                                ctx.arc(node.x!, node.y!, nodeRadius, 0, Math.PI * 2);
                                ctx.closePath();
                                ctx.strokeStyle = 'hsl(0 0 20)';
                                ctx.lineWidth = 1;
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
                    /> }
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