import { useNavigate } from 'react-router-dom';
import { GraphRepositoryContext } from './GraphRepositoryContext';
import {
    AppBar,
    CircularProgress,
    Fab,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Paper,
    Stack,
    Toolbar
} from "@mui/material";
import React from 'react';
import ScanningModal from "./ScanningModal";
import { extractGraphFromImage } from "./extractGraphFromImage";
import { Add,  CameraAlt } from '@mui/icons-material';
import { MindMapGraphData } from './MindMap';

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
    return <div>
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <span>Your Mind Maps</span>
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
            <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                {GraphContext.graphs.map((g, i) =>
                    <ListItem
                        key={g.id} 
                        sx={{
                            justifyContent: 'space-between',
                            cursor:'pointer'
                        }}
                        onClick={() => navigate(`/graph/${g.id}`)}

                    >
                        <ListItemIcon>
                            <img src="/graph.svg"/>
                        </ListItemIcon>
                        <ListItemText 
                            primary={`Graph #${i + 1}`}
                            secondary={`${g.nodes.length} nodes: ${g.nodes.map(n => n.label).join(', ')}`}
                        />
                    </ListItem>
                )}
            </List>

            <Stack
                gap={2}
                direction={"row"} 
                alignItems={"center"}
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
                <Fab
                    color="primary"
                    onClick={() => {
                        handleNewGraph({
                            nodes: [{ id: crypto.randomUUID(), label: 'HOME', type: 'HOME' }],
                            links: []
                        });
                    }}
                    disabled={busyExtracting}
                >
                    <Add/>
                </Fab>
            </Stack>
        </Paper>
    </div>;
}