import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { DirectedGraphNode, MindMapGraphData, MindMapGraphNode } from './MindMap';

type HierarchicalNode = {
    id: string,
    label: string,
    children: HierarchicalNode[]
};

function asHierarchy(graph: MindMapGraphData, node: DirectedGraphNode<MindMapGraphNode>): HierarchicalNode {
    const {id,label} = node;
    const children = 
        graph.links
        .filter(l => l.target === node.id)
        .map(l => graph.nodes.find(n => n.id === l.source))
        .filter(n => n !== undefined)
        .map(n => asHierarchy(graph,n!));
    return { id, label, children };
}

function HierarchicalNodeList({root}:{root:HierarchicalNode}){
    function HierarchicalNodeChildList(children: HierarchicalNode[]){
        return children.length === 0 
        ? <></> 
        : <ul>
            {children.map(n => (
                <li key={n.id}>
                    {n.label}
                    {HierarchicalNodeChildList(n.children)}
                </li>
            ))}
        </ul>
    }
    return <div>
        {root.label}
        {HierarchicalNodeChildList(root.children)}
    </div>;
}

export function MindMapOutlineModal({
    open,
    graph,
    onClose
}:{
    open: boolean;
    graph: MindMapGraphData;
    onClose: () => void;
}) {
    const home = graph.nodes.find(n => n.type === "HOME");
    return (
        <Dialog
            open={open}
            closeAfterTransition={true}
            onClose={() => {
                onClose();
            }}
        >
            <DialogTitle>Mind Map Outline</DialogTitle>
            <DialogContent>
                {home !== undefined 
                ? <HierarchicalNodeList root={asHierarchy(graph, home)}/>
                : <div>No HOME found</div>}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => {
                    onClose();
                }}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}