import { Link, useNavigate } from 'react-router-dom';
import { GraphRepositoryContext } from './GraphRepositoryContext';
import {
    AppBar,
    Button,
    CircularProgress,
    List,
    ListItem,
    Paper,
    Toolbar,
    Typography
} from "@mui/material";
import React from 'react';
import ScanningModal from "./ScanningModal";
import { extractGraphFromImage } from "./extractGraphFromImage";
import { Camera } from '@mui/icons-material';

export function GraphList() {
    const navigate = useNavigate();
    const GraphContext = React.useContext(GraphRepositoryContext);
    const [busyExtracting,setBusyExtracting] = React.useState(false);
    const [scanningModalVisible, setScanningModalVisible] = React.useState<boolean>(false);
    return <div>
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <span>Available Graphs</span>
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
                            const newGraph = {...graph, id: crypto.randomUUID()};
                            console.log('extracted graph',newGraph);
                            GraphContext.saveGraph(newGraph);
                            setBusyExtracting(false);
                            navigate(`/graph/${newGraph.id}`);
                        }
                    });
                }
            }}
        />}

        <Paper elevation={0}>
            <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                {GraphContext.graphs.map((g, i) =>
                    <ListItem key={g.id} sx={{ justifyContent: 'space-between' }}>
                        <Link to={`/graph/${g.id}`}>
                            Graph #{i + 1}
                        </Link>
                        <div>
                            {g.nodes.length} nodes: {g.nodes.map(n => n.label).join(', ')}
                        </div>
                    </ListItem>
                )}
            </List>

            <Button
                variant="contained"
                color="warning"
                onClick={() => {
                    console.log('scanning');
                    setScanningModalVisible(true);
                }}
                disabled={busyExtracting}
            >
                {busyExtracting
                    ? <CircularProgress size={20} sx={{ color: 'white' }} />
                    : <Camera />}
                <Typography sx={{ marginLeft: 1 }}>Scan</Typography>
            </Button>
        </Paper>
    </div>;
}