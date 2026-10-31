import React from "react";
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d";
import { useElementSize } from "./useContainerWidth";
import { Fab, Breadcrumbs, Button, Paper, Snackbar, Stack} from "@mui/material";
import { fillTextInsideCircle } from "./fillTextInsideCircle";
import { useUndo } from "./undo/useUndo";
import { MindMap, MindMapGraphData, MindMapGraphNode, PathSegment} from "./MindMap";
import { Transcript, useSpeechRecognition } from "./useSpeechRecognition";
import { ListenFab } from "./ListenFab";
import { MultiModalPrompt } from "./MultiModalPrompt";
import { GraphNodeClickMode, MindMapEditorToolbar } from "./MindMapEditorToolbar";
import { loadImgElement } from "./loadImgElement";
import { useNavigator } from "./NavigatorContext";
import { standingAt } from "./Navigator";
import { YouStrip } from "./YouStrip";
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
    const breadCrumbsRef = React.useRef<HTMLDivElement>(null);
    const [homeImage,setHomeImage] = React.useState<HTMLImageElement>();
    //the breadcrumb bar keeps a fixed height (it scrolls sideways) so the canvas never resizes when the path grows
    const breadCrumbsHeight = 40;
    const height = React.useMemo(() => window.innerHeight - (headerSize.height + breadCrumbsHeight), [
        headerSize
    ]);
    const [revealHidden, setRevealHidden] = React.useState(false);
    const [removedNode, setRemovedNode] = React.useState<MindMapGraphNode>();
    const width = window.innerWidth;

    const [pathHome,setPathHome] = React.useState<PathSegment[]>()
    const [graph,setGraph,undoController] = useUndo(value,onChange);
    const change = React.useCallback((updatedGraph: MindMapGraphData) => {
        //the undo history passes the change on to onChange, so it is saved once
        setGraph(updatedGraph);
    },[setGraph]);
    const graphRef = React.useRef<GraphRefType>();
    const home = graph.nodes.find(n => n.type === "HOME");
    const [selectedNodeId, selectNodeId] = React.useState<string | undefined>(home?.id);
    const [rabbitHoleModalVisible, setRabbitHoleModalVisible] = React.useState<boolean>(false);

    const nav = useNavigator();
    //once the trail has loaded, open the map where Jon stands; after that, every place he opens is a visit
    const syncedWithTrail = React.useRef(false);
    React.useEffect(() => {
        if (!nav.loaded || syncedWithTrail.current) {
            return;
        }
        syncedWithTrail.current = true;
        const here = standingAt(nav.tether);
        if (MindMap.visibleGraph(value, false).nodes.some(n => n.id === here)) {
            selectNodeId(here);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nav.loaded]);
    React.useEffect(() => {
        if (syncedWithTrail.current && selectedNodeId && value.nodes.some(n => n.id === selectedNodeId)) {
            nav.arrive(selectedNodeId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNodeId]);

    const selectedNode = React.useMemo(
        () => value.nodes.find(n => n.id === selectedNodeId),
        [selectedNodeId, value]);
    const clonedGraphData = React.useMemo(
        () => {
            //only the tree is drawn; ties across it (BLOCKED_BY, ALSO_IN, labelled) get their own view later
            const visible = MindMap.visibleGraph(value, revealHidden);
            return MindMap.clone({...visible, links: visible.links.filter(l => l.type === 'PART_OF')});
        },
        [value, revealHidden]);

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
                    setRemovedNode(selectedNode);
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
        //keep the selected node, at the end of the path, in view
        const bar = breadCrumbsRef.current;
        if(bar){
            bar.scrollLeft = bar.scrollWidth;
        }
    },[pathHome]);

    React.useEffect(() => {
        loadImgElement('/Enso.svg').then(setHomeImage);
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

    //which nodes would show with hidden nodes tucked away; the rest are drawn muted when revealed
    const visibleIds = React.useMemo(
        () => new Set(MindMap.visibleGraph(value, false).nodes.map(n => n.id)),
        [value]);

    const isMuted = (node: MindMapGraphNode) =>
        MindMap.isTucked(node) || (revealHidden && !visibleIds.has(node.id));

    const nodeForegroundColor = (node: MindMapGraphNode): string =>
        node.type === 'HOME' || isMuted(node)
        ? 'black'
        : 'white';

    const nodeColor = (node:MindMapGraphNode) =>
        node.type === 'HOME'
        ? 'white'
        : isMuted(node)
        ? node.id === selectedNodeId ? 'hsl(220 30 70)' : 'hsl(0 0 75)'
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
                    revealHidden={revealHidden}
                    setRevealHidden={reveal => {
                        setRevealHidden(reveal);
                        if(!reveal && selectedNodeId && !visibleIds.has(selectedNodeId)){
                            selectNodeId(home?.id);
                        }
                    }}
                    onNodeRemoved={setRemovedNode}
                    selectNodeId={selectNodeId}
                    selectedNode={selectedNode}
                    undoController={undoController}
                    onChange={change}
                />
                <YouStrip graph={value} onChange={change} selectNodeId={selectNodeId}/>
            </div>

            <div
                ref={breadCrumbsRef}
                style={{height: breadCrumbsHeight, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap'}}
            >
                {pathHome && pathHome.length > 1 && (
                    <Breadcrumbs
                        separator="&larr;"
                        aria-label="breadcrumb"
                        sx={{'& .MuiBreadcrumbs-ol': {flexWrap: 'nowrap', height: breadCrumbsHeight}, '& .MuiBreadcrumbs-li': {flexShrink: 0}}}
                    >
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

            <Snackbar
                open={removedNode !== undefined}
                autoHideDuration={8000}
                onClose={(_, reason) => {
                    if(reason !== 'clickaway'){
                        setRemovedNode(undefined);
                    }
                }}
                message={`Deleted "${removedNode?.label ?? ''}"`}
                action={
                    <Button color="info" size="small" onClick={() => {
                        undoController.undo();
                        if(removedNode){
                            selectNodeId(removedNode.id);
                        }
                        setRemovedNode(undefined);
                    }}>
                        Undo
                    </Button>
                }
            />

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
                                ctx.save();
                                ctx.beginPath();
                                ctx.arc(node.x!, node.y!, nodeRadius, 0, Math.PI * 2);
                                ctx.closePath();
                                ctx.strokeStyle = 'hsl(0 0 20)';
                                ctx.lineWidth = 1;
                                if (MindMap.isBlocked(value, node.id)) {
                                    //waiting on something: a dashed ring
                                    ctx.setLineDash([3, 2]);
                                    ctx.lineWidth = 2;
                                }
                                ctx.stroke();
                                ctx.restore();
                            }
                            //threads that checked in without a place: a numbered badge on HOME, so the question can't hide
                            const asking = node.type === "HOME" ? nav.trail.unplaced.length : 0;
                            if (asking > 0) {
                                ctx.save();
                                const r = Math.max(4.5, 7 / globalScale);
                                const bx = node.x! + nodeRadius * 0.75;
                                const by = node.y! - nodeRadius * 0.75;
                                ctx.beginPath();
                                ctx.arc(bx, by, r, 0, Math.PI * 2);
                                ctx.fillStyle = 'hsl(25 90 48)';
                                ctx.fill();
                                ctx.lineWidth = Math.max(0.8, 1.5 / globalScale);
                                ctx.strokeStyle = 'white';
                                ctx.stroke();
                                ctx.fillStyle = 'white';
                                ctx.font = `bold ${r * 1.25}px Sans-Serif`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(asking > 9 ? "9+" : String(asking), bx, by + r * 0.05);
                                ctx.restore();
                            }
                            const flag = nav.flagOf(node.id);
                            if (flag) {
                                ctx.save();
                                const fontSize = Math.max(5, 10 / globalScale);
                                ctx.font = `${fontSize}px Sans-Serif`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';
                                ctx.fillStyle = 'hsl(220 60 35)';
                                const text = `⚑ ${flag.label}`;
                                ctx.fillText(text.length > 24 ? `${text.slice(0, 23)}…` : text, node.x!, node.y! - nodeRadius - 1);
                                ctx.restore();
                            }
                            //flares, smoke and fresh tracks sit just under their place; a thread's question is a flare at HOME
                            const signals = nav.signalsAt(node.id);
                            const glyph =
                                signals.some(x => x.kind === "request") ? "✴ flare"
                                : node.type === "HOME" && nav.trail.unplaced.length > 0 ? "✴ Claude asks"
                                : signals.some(x => x.kind === "trouble") ? "≋ smoke"
                                : signals.some(x => x.kind === "news") ? "∴ fresh tracks"
                                : undefined;
                            if (glyph) {
                                ctx.save();
                                const fontSize = Math.max(5, 10 / globalScale);
                                ctx.font = `${fontSize}px Sans-Serif`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'top';
                                ctx.fillStyle = glyph.startsWith("✴") ? 'hsl(25 85 40)' : glyph.startsWith("≋") ? 'hsl(0 0 35)' : 'hsl(140 40 30)';
                                ctx.fillText(glyph, node.x!, node.y! + nodeRadius + 1);
                                ctx.restore();
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