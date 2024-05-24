import {
  CssBaseline
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import MindMapGraph from "./MindMapGraph";
import React from "react";
import { MindMapGraphData } from "./MindMap";
//import { useContainerHeight } from "./useContainerWidth";

export default function App() {
  //const {availableHeight,containerRef} = useContainerHeight();
  const [graph,setGraph] = React.useState<MindMapGraphData>({
    nodes:[
      {id: 'HOME',label:'Mindful (Zero)',type:'HOME'},
      {id: '1',label:'Subtopic #1',type:'RabbitHole'},
      {id: '2',label:'Subtopic #2',type:'RabbitHole'},
      {id: '3',label:'Subtopic #3',type:'RabbitHole'},
    ],
    links:[
      {source:'1',target:'HOME',type:'RETURNS_TO'},
      {source:'2',target:'HOME',type:'RETURNS_TO'},
      {source:'3',target:'HOME',type:'RETURNS_TO'}
    ]
  });
  const defaultTheme = createTheme();
  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      <main>
        <MindMapGraph value={graph} height={window.innerHeight} onChange={setGraph}/>
      </main>
    </ThemeProvider>
  );
}
