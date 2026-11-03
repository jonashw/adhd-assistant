import { useNavigate } from 'react-router-dom';
import { GraphRepositoryContext } from './GraphRepositoryContext';
import {
    AppBar,
    Button,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fab,
    IconButton,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Paper,
    SpeedDial,
    SpeedDialAction,
    SpeedDialIcon,
    Stack,
    TextField,
    Toolbar,
    Typography
} from "@mui/material";
import React from 'react';
import ScanningModal from "./ScanningModal";
import { extractGraphFromImage } from "./extractGraphFromImage";
import { CameraAlt, Delete, Download, Edit, UploadFile } from '@mui/icons-material';
import { MindMap, MindMapGraphData, MindMapGraphDataRecord } from './MindMap';
import { exportGraph, readGraphFile } from './GraphFile';
import { ServerApi } from './ServerApi';
import { sampleGraphs } from './sampleGraphs';
import { ConnectedAppsDialog } from './ConnectedAppsDialog';

function GraphIcon({size}:{size?:number}){ return <img src="/graph.svg" width={size} height={size}/>; }

const previewLength = 60;

/* One short line per map: how many places, then the open ones by name until about 60 characters, ending in an ellipsis when cut */
function graphSummary(graph: MindMapGraphData): string {
    const places = graph.nodes.filter(n => n.type !== 'HOME');
    const count = `${places.length} ${places.length === 1 ? 'place' : 'places'}`;
    const open = places.filter(n => !n.hidden && n.status !== 'done' && n.status !== 'dropped').map(n => n.label.trim());
    let preview = '';
    for (const label of open) {
        const next = preview ? `${preview}, ${label}` : label;
        if (next.length > previewLength) {
            const room = previewLength - (preview ? preview.length + 2 : 0);
            //a label that won't fit is cut at a word if a useful piece of it fits, otherwise left out
            const cut = label.slice(0, room).replace(/\s+\S*$/, '');
            preview = cut.length >= 8 ? (preview ? `${preview}, ${cut}` : cut) : preview || label.slice(0, previewLength);
            return `${count} · ${preview}…`;
        }
        preview = next;
    }
    return preview ? `${count} · ${preview}` : count;
}

const graphName = (g: MindMapGraphDataRecord, i: number) => g.title || `Graph #${i + 1}`;

export function GraphList() {
    const navigate = useNavigate();
    function handleNewGraph(graph: MindMapGraphData){
        const newGraph = MindMap.normalize({...graph, id: crypto.randomUUID()});
        console.log('extracted graph',newGraph);
        GraphContext.saveGraph(newGraph);
        navigate(`/graph/${newGraph.id}`);
    }
    const GraphContext = React.useContext(GraphRepositoryContext);
    const [busyExtracting,setBusyExtracting] = React.useState(false);
    const [scanningModalVisible, setScanningModalVisible] = React.useState<boolean>(false);
    const [idOfGraphToDelete,setIdOfGraphToDelete] = React.useState<string>();
    const [titling, setTitling] = React.useState<{graph: MindMapGraphDataRecord, index: number, title: string}>();
    function saveTitle(){
        if(!titling){
            return;
        }
        const title = titling.title.trim();
        GraphContext.saveGraph({...titling.graph, title: title || undefined});
        setTitling(undefined);
    }
    const [speedDialOpen, setSpeedDialOpen] = React.useState(false);
    const [connectedAppsOpen, setConnectedAppsOpen] = React.useState(false);
    const importInputRef = React.useRef<HTMLInputElement>(null);
    function handleImport(file: File){
        readGraphFile(file)
            .then(graph => {
                //keep the exported id so a re-import is identical, unless that graph is already here
                const exists = GraphContext.graphs.some(g => g.id === graph.id);
                const imported = exists ? {...graph, id: crypto.randomUUID()} : graph;
                GraphContext.saveGraph(MindMap.normalize(imported));
                navigate(`/graph/${imported.id}`);
            })
            .catch((e: Error) => alert(`Could not import that file. ${e.message}`));
    }
    return <div>
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <span>ADHD Assist</span>
                {GraphContext.status?.mode === "server" && <Stack direction="row" gap={1}>
                    <Button color="inherit" size="small" onClick={() => setConnectedAppsOpen(true)}>
                        Connected apps
                    </Button>
                    <Button
                        color="inherit"
                        size="small"
                        title={`Signed in as ${GraphContext.status.email}`}
                        onClick={() => ServerApi.signOut().then(() => window.location.reload())}
                    >
                        Sign out
                    </Button>
                </Stack>}
            </Toolbar>
        </AppBar>

        <ConnectedAppsDialog open={connectedAppsOpen} onClose={() => setConnectedAppsOpen(false)}/>

        {scanningModalVisible && <ScanningModal
            open={scanningModalVisible}
            onClose={(img?: Blob) => {
                setScanningModalVisible(false);
                if(img){
                    setBusyExtracting(true);
                    extractGraphFromImage(img).then(graph => {
                        if(!graph){
                            alert('The system was unable to extract graph from the image provided.')
                            setBusyExtracting(false);
                        } else {
                            handleNewGraph(graph);
                            setBusyExtracting(false);
                        }
                    });
                }
            }}
        />}


        <Paper elevation={0}>
            {GraphContext.graphs.length 
                ? <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                    {GraphContext.graphs.map((g, i) =>
                        <ListItem
                            key={g.id} 
                            sx={{
                                justifyContent: 'space-between',
                                cursor:'pointer',
                                //room for the three buttons, so the text never runs under them
                                pr: '152px'
                            }}
                            onClick={() => navigate(`/graph/${g.id}`)}
                            secondaryAction={
                                <Stack direction="row" gap={0.5}>
                                    <IconButton title="Name this mind map" aria-label="rename" onClick={e => {
                                        e.stopPropagation();
                                        setTitling({graph: g, index: i, title: g.title ?? ''});
                                    }}>
                                        <Edit />
                                    </IconButton>
                                    <IconButton title="Export this mind map as a JSON file" aria-label="export" onClick={e => {
                                        e.stopPropagation();
                                        exportGraph(g, `adhd-assist-${g.title || `graph-${i + 1}`}-${new Date().toISOString().slice(0, 10)}`);
                                    }}>
                                        <Download />
                                    </IconButton>
                                    <IconButton edge="end" title="Delete this item" aria-label="delete" onClick={e => {
                                        e.stopPropagation();
                                        setIdOfGraphToDelete(g.id);
                                    }}>
                                        <Delete />
                                    </IconButton>
                                </Stack>
                            }

                        >
                            <ListItemIcon>
                                <GraphIcon/>
                            </ListItemIcon>
                            <ListItemText
                                primary={graphName(g, i)}
                                secondary={graphSummary(g)}
                                primaryTypographyProps={{noWrap: true}}
                                secondaryTypographyProps={{sx: {display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}}
                            />
                        </ListItem>
                    )}
                </List>
                : <Container 
                    sx={{
                        height:'80svh',
                        display:'flex',
                        alignItems:'center',
                        justifyContent:'space-around',
                        flexDirection:'column'
                    }}
                >
                    <Stack 
                        direction={"column"}
                        gap={2}
                        alignItems={'center'}
                        justifyContent={"space-between"}
                    >
                        <GraphIcon size={96}/>
                        <Typography variant="h6" sx={{marginTop:5}}>
                            You have no mind maps right now
                        </Typography>
                        <Typography>
                            Add one and it will show up here.
                        </Typography>
                    </Stack>
                </Container>
            }

            <Stack
                gap={2}
                direction={"row"} 
                alignItems={"flex-end"}
                sx={{position:'absolute',right:'1em',bottom:'1em'}}
            >
                <Fab
                    color="success"
                    onClick={() => {
                        console.log('scanning');
                        setScanningModalVisible(true);
                    }}
                    disabled={busyExtracting}
                >
                    {busyExtracting
                        ? <CircularProgress size={20} sx={{ color: 'white' }} />
                        : <CameraAlt />}
                </Fab>

                <SpeedDial
                    ariaLabel="Add a new mind map"
                    icon={<SpeedDialIcon />}
                    onClose={() => setSpeedDialOpen(false)}
                    onOpen={() => {/* disabled the default mouseover trigger */}}
                    onClick={() => { 
                        if(busyExtracting){
                            return;
                        }
                        setSpeedDialOpen(true); 
                    }}
                    open={speedDialOpen}
                >
                        <SpeedDialAction
                            icon={<img src="/Enso.svg" width={24} />}
                            tooltipTitle={"Empty"}
                            tooltipOpen
                            onClick={() => {
                                handleNewGraph({
                                    nodes: [{ id: crypto.randomUUID(), label: 'HOME', type: 'HOME' }],
                                    links: []
                                });
                            }}
                        />
                        <SpeedDialAction
                            icon={<UploadFile />}
                            tooltipTitle={"Import"}
                            tooltipOpen
                            onClick={() => {
                                setSpeedDialOpen(false);
                                importInputRef.current?.click();
                            }}
                        />
                        <SpeedDialAction
                            icon={<GraphIcon size={24} />}
                            tooltipTitle={"Sample"}
                            tooltipOpen
                            onClick={() => {
                                handleNewGraph({
                                    ...sampleGraphs[0]
                                });
                            }}
                        />
                </SpeedDial>

 
            </Stack>
        </Paper>

        <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if(file){
                    handleImport(file);
                }
            }}
        />

        <Dialog open={titling !== undefined} onClose={() => setTitling(undefined)} fullWidth maxWidth="sm">
            <DialogTitle>Name this mind map</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label="Title"
                    placeholder={titling ? `Graph #${titling.index + 1}` : ''}
                    helperText="Leave it empty to go back to the number."
                    value={titling?.title ?? ''}
                    inputProps={{maxLength: 200}}
                    onChange={e => setTitling(t => t && {...t, title: e.target.value})}
                    onKeyDown={e => {
                        if(e.key === 'Enter'){
                            saveTitle();
                        }
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setTitling(undefined)}>Cancel</Button>
                <Button variant="contained" onClick={saveTitle}>Save</Button>
            </DialogActions>
        </Dialog>

        <Dialog
            open={idOfGraphToDelete !== undefined}
            closeAfterTransition={true}
            onClose={() => {
                setIdOfGraphToDelete(undefined);
            }}
        >
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogContent>
                <Typography gutterBottom>
                    Selecting 'YES' will delete the mind map.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => {
                    if(idOfGraphToDelete === undefined){ 
                        return;
                    }
                    GraphContext.deleteGraphById(idOfGraphToDelete);
                    setIdOfGraphToDelete(undefined);
                }}>Yes</Button>
                <Button onClick={() => {
                    setIdOfGraphToDelete(undefined);
                }}>No</Button>
            </DialogActions>
        </Dialog>
    </div>;
}