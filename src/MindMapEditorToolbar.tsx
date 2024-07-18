import { AppBar, Button, ButtonGroup, Toolbar} from "@mui/material";
import { UndoController } from "./undo/useUndo";
import { UndoRedoToolbar } from "./undo/UndoRedoToolbar";
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import React from "react";
import { NodeNameEditorModal } from "./NodeNameEditorModal";
import { AltRoute, Delete, Edit } from "@mui/icons-material";
import { MindMapOutlineModal } from "./MindMapOutlineModal";


export type GraphNodeClickMode = "re-parent" | "select";

export function MindMapEditorToolbar({
    value,
    onChange,
    undoController,
    selectedNode,
    selectNodeId,
    nodeClickMode,
    setNodeClickMode,
}: {
    value: MindMapGraphData;
    onChange: (value: MindMapGraphData) => void;
    undoController: UndoController<MindMapGraphData>;
    selectedNode?: DirectedGraphNode<MindMapGraphNode>;
    selectNodeId: (id?: string) => void;
    nodeClickMode: GraphNodeClickMode;
    setNodeClickMode: (value: GraphNodeClickMode) => void;
}) {
    const home = value.nodes.find(n => n.type === "HOME");
    const [nodeToRename,setNodeToRename] = React.useState<DirectedGraphNode<MindMapGraphNode>>();
    const [outlineVisible, setOutlineVisible] = React.useState(false);
    return (
        <>
            <NodeNameEditorModal
                node={nodeToRename}
                onClose={(updatedName?: string) => {
                    if(nodeToRename !== undefined && updatedName !== undefined){
                        const updatedGraph = {
                            links: value.links,
                            nodes: value.nodes.map(n => 
                                n.id === nodeToRename.id 
                                ? {...n, label: updatedName}
                                : n
                            )
                        };
                        onChange(updatedGraph);
                    }
                    setNodeToRename(undefined);
                }}
            />

            <MindMapOutlineModal
                graph={value}
                open={outlineVisible}
                onClose={() => {
                    setOutlineVisible(false);
                }}
            />

            <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
                <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                    <UndoRedoToolbar controller={undoController} />
                    <Button 
                        variant="contained"
                        color="info"
                        onClick={() => setOutlineVisible(true)}
                    >
                        View Outline
                    </Button>

                    {selectedNode
                        ? selectedNode.type === "HOME"
                            ? <> You are home </>
                            : nodeClickMode === "select"
                            ? <ButtonGroup aria-label="Operations that can be performed on the currently-selected node">
                                <Button
                                    variant="contained"
                                    title="Rename this node"
                                    color="info"
                                    disabled={!selectedNode}
                                    onClick={() => {
                                        if (!selectedNode) {
                                            return;
                                        }
                                        setNodeToRename(selectedNode);
                                    }}
                                >
                                    <Edit/>
                                </Button>

                                <Button
                                    title={"Change the target of this node's RETURNS_TO relation"}
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
                                    <AltRoute/>
                                </Button>

                                <Button
                                    variant="contained"
                                    title="Remove this node from the graph"
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
                                    <Delete/>
                                </Button>
                            </ButtonGroup>
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
                            
                        </>}

                </Toolbar>
            </AppBar>
        </>
    );
}