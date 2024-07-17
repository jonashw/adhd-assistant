import { Link } from 'react-router-dom';
import { GraphRepositoryContext } from './GraphRepositoryContext';
import {
    AppBar,
    List,
    ListItem,
    Paper,
    Toolbar
} from "@mui/material";
import React from 'react';

export function GraphList() {
    const GraphContext = React.useContext(GraphRepositoryContext);
    return <div>
        <AppBar position="static" sx={{ px: 1 }} enableColorOnDark>
            <Toolbar sx={{ gap: 1, p: 0, justifyContent: 'space-between' }}>
                <span>Available Graphs</span>
            </Toolbar>
        </AppBar>

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
        </Paper>
    </div>;
}