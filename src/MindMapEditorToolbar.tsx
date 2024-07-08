import { AppBar, Button, ButtonGroup, Stack, Toolbar } from "@mui/material";
import { UndoController } from "./undo/useUndo";
import { UndoRedoToolbar } from "./undo/UndoRedoToolbar";
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { CircularArray } from "./useCircularArray";
import { ArrowLeft, ArrowRight } from "@mui/icons-material";

export type GraphNodeClickMode = "re-parent" | "select";


export function MindMapEditorToolbar({
    value,
    onChange,
    undoController,
    selectedNode,
    selectNodeId,
    nodeClickMode,
    setNodeClickMode,
    homeImages
}: {
    value: MindMapGraphData;
    onChange: (value: MindMapGraphData) => void;
    undoController: UndoController<MindMapGraphData>;
    selectedNode?: DirectedGraphNode<MindMapGraphNode>;
    selectNodeId: (id: string) => void;
    nodeClickMode: GraphNodeClickMode;
    setNodeClickMode: (value: GraphNodeClickMode) => void;
    homeImages: CircularArray<HTMLImageElement>;
}) {
    return (
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <Stack sx={{ p: 0 }} gap={0.85} direction="row" justifyContent="space-between">
                    <UndoRedoToolbar controller={undoController} />
                </Stack>

                {selectedNode
                    ? selectedNode.id === "HOME"
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

                                    selectNodeId("HOME");
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
                        : <> </>
                    : <></>}

            </Toolbar>
        </AppBar>
    );
}
