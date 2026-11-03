import { AppBar, Button, ButtonGroup, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Toolbar} from "@mui/material";
import { UndoController } from "./undo/useUndo";
import { UndoRedoToolbar } from "./undo/UndoRedoToolbar";
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode, nodeStatuses } from "./MindMap";
import React from "react";
import { NodeNameEditorModal } from "./NodeNameEditorModal";
import { AltRoute, Check, Delete, Edit, FormatListBulleted, OutlinedFlag, TaskAlt, Visibility, VisibilityOff } from "@mui/icons-material";
import { PlaceDetailsDialog } from "./PlaceDetailsDialog";
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
    revealHidden,
    setRevealHidden,
    onNodeRemoved,
}: {
    value: MindMapGraphData;
    onChange: (value: MindMapGraphData) => void;
    undoController: UndoController<MindMapGraphData>;
    selectedNode?: DirectedGraphNode<MindMapGraphNode>;
    selectNodeId: (id?: string) => void;
    nodeClickMode: GraphNodeClickMode;
    setNodeClickMode: (value: GraphNodeClickMode) => void;
    revealHidden: boolean;
    setRevealHidden: (value: boolean) => void;
    onNodeRemoved: (node: MindMapGraphNode) => void;
}) {
    const home = value.nodes.find(n => n.type === "HOME");
    const [nodeToRename,setNodeToRename] = React.useState<DirectedGraphNode<MindMapGraphNode>>();
    const [outlineVisible, setOutlineVisible] = React.useState(false);
    const [detailsVisible, setDetailsVisible] = React.useState(false);
    const [statusMenuAnchor, setStatusMenuAnchor] = React.useState<HTMLElement>();
    const anyTucked = value.nodes.some(MindMap.isTucked);
    const closeStatusMenu = (updatedGraph?: MindMapGraphData) => {
        setStatusMenuAnchor(undefined);
        if(!updatedGraph || !selectedNode){
            return;
        }
        const updatedNode = updatedGraph.nodes.find(n => n.id === selectedNode.id);
        if(updatedNode && MindMap.isTucked(updatedNode) && !revealHidden){
            //the selected node is leaving the graph, so select where it returns to
            selectNodeId(MindMap.parentOf(updatedGraph, selectedNode.id) ?? home?.id);
        }
        onChange(updatedGraph);
    };
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

            {detailsVisible && <PlaceDetailsDialog
                node={selectedNode}
                graph={value}
                onChange={onChange}
                onClose={() => setDetailsVisible(false)}
            />}

            <MindMapOutlineModal
                graph={value}
                open={outlineVisible}
                onClose={() => {
                    setOutlineVisible(false);
                }}
            />

            <Menu
                anchorEl={statusMenuAnchor}
                open={statusMenuAnchor !== undefined && selectedNode !== undefined}
                onClose={() => closeStatusMenu()}
            >
                {selectedNode && nodeStatuses.map(status => {
                    const current = (selectedNode.status ?? 'active') === status;
                    return (
                        <MenuItem
                            key={status}
                            selected={current}
                            onClick={() => closeStatusMenu(
                                current ? undefined : MindMap.setStatus(value, selectedNode.id, status))}
                        >
                            <ListItemIcon>{current && <Check fontSize="small"/>}</ListItemIcon>
                            <ListItemText
                                primary={status[0].toUpperCase() + status.slice(1)}
                                secondary={status === 'done' && current && selectedNode.doneAt ? selectedNode.doneAt : undefined}
                            />
                        </MenuItem>
                    );
                })}
                <Divider/>
                {selectedNode && <MenuItem
                    onClick={() => closeStatusMenu(MindMap.setHidden(value, selectedNode.id, !selectedNode.hidden))}
                >
                    <ListItemIcon>{selectedNode.hidden ? <Visibility fontSize="small"/> : <VisibilityOff fontSize="small"/>}</ListItemIcon>
                    <ListItemText primary={selectedNode.hidden ? "Unhide" : "Hide"}/>
                </MenuItem>}
            </Menu>

            <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
                <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between', '& .MuiButton-root': { minWidth: 40, px: 1 } }}>
                    <UndoRedoToolbar controller={undoController} />
                    <Button 
                        variant="contained"
                        title="View Outline"
                        color="info"
                        onClick={() => setOutlineVisible(true)}
                    >
                        <FormatListBulleted/>
                    </Button>

                    {(anyTucked || revealHidden) && <Button
                        variant={revealHidden ? "outlined" : "contained"}
                        title={revealHidden ? "Tuck hidden and done nodes away" : "Reveal hidden and done nodes"}
                        color="info"
                        sx={revealHidden ? {bgcolor: 'background.paper'} : undefined}
                        onClick={() => setRevealHidden(!revealHidden)}
                    >
                        {revealHidden ? <VisibilityOff/> : <Visibility/>}
                    </Button>}

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
                                    variant="contained"
                                    title="Set status, or hide this node"
                                    color="info"
                                    onClick={e => setStatusMenuAnchor(e.currentTarget)}
                                >
                                    <TaskAlt/>
                                </Button>

                                <Button
                                    variant="contained"
                                    title="Note, flag, blocked by, small and interest"
                                    aria-label="Place details"
                                    color="info"
                                    onClick={() => setDetailsVisible(true)}
                                >
                                    <OutlinedFlag/>
                                </Button>

                                <Button
                                    title={"Move this node under another parent"}
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
                                        onNodeRemoved(selectedNode);
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