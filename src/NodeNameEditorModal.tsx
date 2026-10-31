import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
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
        if(node === undefined){
            console.log('no node');
            return;
        }
        setName(node.label);
    },[node]);

    return (
        <Dialog
            open={node !== undefined}
            fullWidth
            closeAfterTransition={true}
            onClose={() => {
                onClose();
            }}
        >
            <DialogTitle>Rename node</DialogTitle>
            <DialogContent>
                <TextField
                    required
                    margin="dense"
                    id="value"
                    onFocus={e => {
                        e.target.select();
                    }}
                    name="value"
                    label={"Name"}
                    value={name}
                    onChange={e => setName(e.target.value.replace(/\n/g, ' '))}
                    onKeyDown={e => {
                        //wraps like a text area but submits like a single-line field
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (node !== undefined && name.trim() && name !== node.label) {
                                onClose(name);
                            }
                        }
                    }}
                    multiline
                    maxRows={4}
                    fullWidth
                    variant="standard"
                    autoComplete={"off"}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    disabled={name === node?.label || !name.trim()}
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