import MindMapGraph from "./MindMapGraph";
import React from "react";
import { GraphRepositoryContext } from "./GraphRepositoryContext";
import { useParams } from "react-router-dom";
import { Paper } from "@mui/material";
import { NavigatorProvider } from "./NavigatorContext";
//import TextParser from "./TextParser";

export default function GraphEditor() {
  const params = useParams();
  const GraphContext = React.useContext(GraphRepositoryContext);

  //const parsedGraph = TextParser.parse("UI (React) -GET/POST-> Server API (C#; Azure Function App) -SELECT/INSERT-> SQL Server Database");
  //console.log({parsedGraph,sampleGraph,defaultGraphData});
  const graph = GraphContext.graphs.find(g => g.id === params.graphId);

  if(!graph){
    return <Paper elevation={0}>Invalid Graph ID</Paper>;
  }
  return (
      <NavigatorProvider key={graph.id} graph={graph}>
        <MindMapGraph
          key={`${graph.id}:${GraphContext.reloadCount[graph.id] ?? 0}`}
          value={graph}
          onChange={updatedGraph => {
            GraphContext.saveGraph({...updatedGraph, id: graph.id});
            console.log({updatedGraph});
          }}
        />
      </NavigatorProvider>
  );
}
