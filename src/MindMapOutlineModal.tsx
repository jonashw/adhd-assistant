import { Breadcrumbs, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography, alpha, useTheme } from '@mui/material';
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode } from './MindMap';
import { useNavigator } from './NavigatorContext';
import { formatDue } from './Navigator';

type HierarchicalNode = {
    id: string,
    label: string,
    note?: string,
    muted: boolean,
    children: HierarchicalNode[]
};

type FlagText = (id: string) => string | undefined;

function asHierarchy(graph: MindMapGraphData, node: DirectedGraphNode<MindMapGraphNode>, flagText: FlagText, underTucked = false): HierarchicalNode {
    const {id,label} = node;
    const muted = underTucked || MindMap.isTucked(node);
    const note = [
        node.status && node.status !== 'active' ? node.status : undefined,
        node.status === 'done' ? node.doneAt : undefined,
        node.hidden ? 'hidden' : undefined,
        MindMap.isBlocked(graph, node.id) ? 'blocked' : undefined,
        flagText(node.id)
    ].filter(s => s).join(', ');
    const children = 
        graph.links
        .filter(l => l.target === node.id && l.type === 'PART_OF')
        .map(l => graph.nodes.find(n => n.id === l.source))
        .filter(n => n !== undefined)
        .map(n => asHierarchy(graph,n!,flagText,muted))
        //tucked nodes sink to the bottom of their level
        .sort((a,b) => Number(a.muted) - Number(b.muted));
    return { id, label, note: note || undefined, muted, children };
}

/* each place's name; the ones on the way from HOME to the selected place are bold, and any of them can be picked */
function HierarchicalNodeList({root, onPath, selectedId, onSelect}:{
    root: HierarchicalNode,
    onPath: Set<string>,
    selectedId?: string,
    onSelect?: (id: string) => void
}){
    const theme = useTheme();
    const name = (n: HierarchicalNode) => {
        const style = {
            fontWeight: onPath.has(n.id) ? 700 : undefined,
            background: n.id === selectedId ? alpha(theme.palette.primary.main, 0.16) : undefined,
            borderRadius: 4, padding: '0 4px', margin: '0 -4px'
        };
        return onSelect
            ? <span role="button" tabIndex={0} style={{...style, cursor: 'pointer'}} onClick={() => onSelect(n.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } }}>{n.label}</span>
            : <span style={style}>{n.label}</span>;
    };
    function HierarchicalNodeChildList(children: HierarchicalNode[]){
        return children.length === 0 
        ? <></> 
        : <ul>
            {children.map(n => (
                <li key={n.id} style={n.muted ? {color: 'GrayText'} : undefined}>
                    {name(n)}
                    {n.note && <small> ({n.note})</small>}
                    {HierarchicalNodeChildList(n.children)}
                </li>
            ))}
        </ul>
    }
    return <div>
        {name(root)}
        {HierarchicalNodeChildList(root.children)}
    </div>;
}

export function MindMapOutlineModal({
    open,
    graph,
    selectedId,
    onSelect,
    onClose
}:{
    open: boolean;
    graph: MindMapGraphData;
    /* the place picked out on the map: the outline shows the way to it from HOME */
    selectedId?: string;
    onSelect?: (id: string) => void;
    onClose: () => void;
}) {
    const home = graph.nodes.find(n => n.type === "HOME");
    const path = home && selectedId ? (MindMap.shortestPathBetween(graph, selectedId, home.id) ?? []) : [];
    const onPath = new Set(path.map(p => p.node.id));
    const trail = [...path].reverse();
    const nav = useNavigator();
    const flagText: FlagText = id => {
        const flag = nav.flagOf(id);
        const signals = nav.signalsAt(id);
        const parts = [
            flag?.dueAt ? `⚑ ${flag.label}, due ${formatDue(flag.dueAt, nav.now)}` : undefined,
            signals.some(s => s.kind === "request") ? "✴ flare" : undefined,
            signals.some(s => s.kind === "trouble") ? "≋ smoke" : undefined,
            signals.some(s => s.kind === "news") ? "∴ fresh tracks" : undefined
        ].filter(Boolean);
        return parts.length ? parts.join(" · ") : undefined;
    };
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
                {trail.length > 1 && <Breadcrumbs separator="›" aria-label="The way from HOME" sx={{mb: 1.5}}>
                    {trail.map((segment, i) => i === trail.length - 1
                        ? <Typography key={segment.node.id} color="text.primary" fontWeight={700}>{segment.node.label}</Typography>
                        : <Link key={segment.node.id} component="button" underline="hover" color="inherit"
                            onClick={() => onSelect?.(segment.node.id)}>{segment.node.label}</Link>)}
                </Breadcrumbs>}
                {home !== undefined 
                ? <HierarchicalNodeList root={asHierarchy(graph, home, flagText)} onPath={onPath} selectedId={selectedId} onSelect={onSelect}/>
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