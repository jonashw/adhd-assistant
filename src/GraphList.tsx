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
    Toolbar,
    Typography
} from "@mui/material";
import React from 'react';
import ScanningModal from "./ScanningModal";
import { extractGraphFromImage } from "./extractGraphFromImage";
import { CameraAlt, Delete } from '@mui/icons-material';
import { MindMapGraphData } from './MindMap';
import { sampleGraphs } from './sampleGraphs';

function GraphIcon({size}:{size?:number}){ return <img src="/graph.svg" width={size} height={size}/>; }

export function GraphList() {
    const navigate = useNavigate();
    function handleNewGraph(graph: MindMapGraphData){
        const newGraph = {...graph, id: crypto.randomUUID()};
        console.log('extracted graph',newGraph);
        GraphContext.saveGraph(newGraph);
        navigate(`/graph/${newGraph.id}`);
    }
    const GraphContext = React.useContext(GraphRepositoryContext);
    const [busyExtracting,setBusyExtracting] = React.useState(false);
    const [scanningModalVisible, setScanningModalVisible] = React.useState<boolean>(false);
    const [idOfGraphToDelete,setIdOfGraphToDelete] = React.useState<string>();
    const [speedDialOpen, setSpeedDialOpen] = React.useState(false);
    return <div>
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <span>ADHD Assist</span>
            </Toolbar>
        </AppBar>

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
                                cursor:'pointer'
                            }}
                            onClick={() => navigate(`/graph/${g.id}`)}
                            secondaryAction={
                                <IconButton edge="end" title="Delete this item" aria-label="delete" onClick={e => {
                                    e.stopPropagation();
                                    setIdOfGraphToDelete(g.id);
                                }}>
                                    <Delete />
                                </IconButton>
                            }

                        >
                            <ListItemIcon>
                                <GraphIcon/>
                            </ListItemIcon>
                            <ListItemText 
                                primary={`Graph #${i + 1}`}
                                secondary={`${g.nodes.length} nodes: ${g.nodes.map(n => n.label).join(', ')}`}
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
                    onOpen={() => setSpeedDialOpen(true)}
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