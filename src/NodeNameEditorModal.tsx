import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import React from "react";
import { DirectedGraphNode, MindMapGraphNode } from "./MindMap";

export function NodeNameEditorModal({
    node,
    onClose
}:{
    node?: DirectedGraphNode<MindMapGraphNode>;
    onClose: (newName?: string) => void;
}){
    const [name,setName] = React.useState(node?.label ?? "");

    React.useEffect(() => {
        setName(node?.label ?? "");
    },[node]);

    return (
        <Dialog
            open={node !== undefined}
            closeAfterTransition={true}
            onClose={() => {
                onClose();
            }}
        >
            <DialogTitle>Rename node</DialogTitle>
            <DialogContent>
                <input
                    ref={e => {
                        e?.focus();
                        e?.select();
                    }}
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    disabled={name === node?.label}
                    onClick={() => {
                        if (node === undefined) {
                            return;
                        }
                        //GraphContext.deleteGraphById(idOfGraphToDelete);
                        onClose(name);
                    }}
                >
                    OK
                </Button>

                <Button onClick={() => {
                    onClose();
                }}>Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}