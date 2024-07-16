import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from "@mui/material";
import { DirectedGraphLink, DirectedGraphNode, MindMapGraphData, MindMapGraphLink, MindMapGraphNode } from "./MindMap";
import { Webcam } from "./Webcam";

type CloudGraph = {
    nodes: {
        id: string;
        label: string
    }[];
    edges: {
        source: string;
        target: string;
        label?: string;
    }[]
};

export default function ScanningModal({
    open,
    onClose
}:{
    open: boolean;
    onClose: (value?: MindMapGraphData) => void;
}){
    async function handleScan(scannedImage: File | Blob): Promise<void> {
        const newGraph: CloudGraph = await fetch('https://jonashw-dev.azurewebsites.net/api/ExtractDirectedAcyclicGraphFromImage',
            {
                method:'POST',
                body: scannedImage
            }
        ).then(r => r.json());

        var links: DirectedGraphLink<MindMapGraphLink>[] = newGraph.edges.map(({source,target}) => ({
            source,
            target,
            type: 'RETURNS_TO'
        }));

        var nodes: DirectedGraphNode<MindMapGraphNode>[] = newGraph.nodes.map(({label,id}) => ({
            label,
            id,
            type: label === "HOME" ? "HOME" : "RabbitHole"
        }));

        const hasHome = nodes.some(n => n.type === "HOME");

        if(!hasHome){
            alert("Sorry, couldn't detect HOME node. Please try again");
            return;
        }
        const graph: MindMapGraphData = {links,nodes}
        console.log({graph});
        onClose(graph);
    }

    return (
        <Dialog
            open={open}
            onClose={() => {
                onClose();
            }}
        >
            <DialogTitle>Scan a physical graph</DialogTitle>
            <DialogContent>
                <div style={{marginBottom:'1em'}}>
                    <Webcam onFrame={osc => {
                        osc.convertToBlob().then(handleScan);
                    }}/>
                </div>

                <DialogContentText gutterBottom>
                    Or upload a photo: 
                    {' '}
                    <input
                        type="file"
                        accept="image/*" 
                        onChange={async e => {
                            const file = e.target.files?.item(0);
                            if(!file){
                                return;
                            }
                            console.log('new file',file);
                            handleScan(file);
                        }}
                    />
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => { onClose(); }}>Cancel</Button>
                <Button type="submit">OK</Button>
            </DialogActions>
        </Dialog>
    );
}