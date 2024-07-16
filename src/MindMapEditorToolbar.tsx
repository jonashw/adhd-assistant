import { AppBar, Button, ButtonGroup, CircularProgress, Stack, Toolbar, Typography } from "@mui/material";
import { UndoController } from "./undo/useUndo";
import { UndoRedoToolbar } from "./undo/UndoRedoToolbar";
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { CircularArray } from "./useCircularArray";
import { ArrowLeft, ArrowRight, Camera } from "@mui/icons-material";
import { green } from "@mui/material/colors";

export type GraphNodeClickMode = "re-parent" | "select";


export function MindMapEditorToolbar({
    value,
    onChange,
    undoController,
    selectedNode,
    selectNodeId,
    nodeClickMode,
    setNodeClickMode,
    homeImages,
    onScan,
    busyExtracting
}: {
    value: MindMapGraphData;
    onChange: (value: MindMapGraphData) => void;
    undoController: UndoController<MindMapGraphData>;
    selectedNode?: DirectedGraphNode<MindMapGraphNode>;
    selectNodeId: (id?: string) => void;
    nodeClickMode: GraphNodeClickMode;
    setNodeClickMode: (value: GraphNodeClickMode) => void;
    homeImages: CircularArray<HTMLImageElement>;
    onScan: () => void;
    busyExtracting: boolean
}) {
    const home = value.nodes.find(n => n.type === "HOME");
    return (
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <Stack sx={{ p: 0 }} gap={0.85} direction="row" justifyContent="space-between">
                    <UndoRedoToolbar controller={undoController} />
                </Stack>

                {selectedNode
                    ? selectedNode.type === "HOME"
                        ? <>
                            <ButtonGroup
                                variant="contained" 
                                color={"info"}
                                aria-label="Change the icon for HOME"
                            >
                                <Button
                                    onClick={() => {
                                        homeImages.prev();
                                    }}
                                    aria-label="Previous home image"
                                >
                                    <ArrowLeft />
                                </Button>
                                {homeImages.currentItem && 
                                    <div style={{
                                        display:'flex',
                                        alignItems:'center',
                                        background: 'white',
                                        padding: '0 8px'
                                    }}>
                                        <img
                                            src={homeImages.currentItem.src} 
                                            style={{height:'32px'}}
                                        />
                                    </div>
                                }
                                <Button
                                    onClick={() => {
                                        homeImages.next();
                                    }}
                                    aria-label="Next home image"
                                >
                                    <ArrowRight />
                                </Button>
                            </ButtonGroup>
                        </>
                        : nodeClickMode === "select"
                        ? <>
                            <Button
                                variant="contained"
                                color="info"
                                disabled={!selectedNode}
                                onClick={() => {
                                    if (!selectedNode) {
                                        return;
                                    }
                                    setNodeClickMode("re-parent");
                                }}
                            >
                                Re-parent
                            </Button>
                            <Button
                                variant="contained"
                                color="error"
                                disabled={!selectedNode}
                                onClick={() => {
                                    if (!selectedNode) {
                                        return;
                                    }
                                    selectNodeId(home?.id);
                                    onChange(MindMap.remove(value, selectedNode));
                                }}
                            >
                                Remove
                            </Button>
                        </>
                        : nodeClickMode === "re-parent"
                        ? <>
                            <span>
                                Click the node you wish to be the parent.
                            </span>
                            <Button 
                                variant="contained"
                                color="error"
                                onClick={() => {
                                    setNodeClickMode("select");
                                }}
                            >
                                Cancel
                            </Button>
                        </>
                        : <>o</>
                    : <>
                        <Button
                            variant="contained"
                            color="warning"
                            onClick={() => {
                                onScan();
                                console.log('scanning');
                            }}
                            disabled={busyExtracting}
                        >
                            {busyExtracting 
                                ? <CircularProgress size={20} sx={{ color: 'white' }} />
                                : <Camera/>}
                            <Typography sx={{marginLeft:1}}>Scan</Typography>
                        </Button>
                    </>}

            </Toolbar>
        </AppBar>
    );
}
