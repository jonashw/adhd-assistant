import {
  CssBaseline
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import MindMapGraph from "./MindMapGraph";
import React from "react";
import { MindMapGraphData } from "./MindMap";
import { useCircularArray } from "./useCircularArray";
import { loadImgElement } from "./loadImgElement";
import TextParser from "./TextParser";

export default function App() {
  const [images,setImages] = React.useState<HTMLImageElement[]>();
  const homeImages = useCircularArray(images ?? []);

  React.useEffect(() => {
    Promise
    .all(['enso-circle.jpg','om.png','buddha.png','yin-yang.png'].map(loadImgElement))
    .then(setImages);
  }, []);

  const sampleGraph: MindMapGraphData = {
    nodes:[
      {id: 'HOME',label:'MINDFUL',type:'HOME'},
      {id: '1',label:'Subtopic #1',type:'RabbitHole'},
      {id: '2',label:'Subtopic #2',type:'RabbitHole'},
      {id: '3',label:'Subtopic #3',type:'RabbitHole'},
    ],
    links:[
      {source:'1',target:'HOME',type:'RETURNS_TO'},
      {source:'2',target:'HOME',type:'RETURNS_TO'},
      {source:'3',target:'HOME',type:'RETURNS_TO'}
    ]
  };
  const parsedGraph = TextParser.parse("UI (React) -GET/POST-> Server API (C#; Azure Function App) -SELECT/INSERT-> SQL Server Database");
  const defaultGraphData = sampleGraph;
  console.log({parsedGraph,sampleGraph,defaultGraphData});
  const [graph,setGraph] = React.useState<MindMapGraphData>(defaultGraphData);
  const defaultTheme = createTheme();
  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      <main>
        {homeImages && 
          <MindMapGraph homeImages={homeImages} value={graph} height={window.innerHeight} onChange={setGraph}/>
        }
      </main>
    </ThemeProvider>
  );
}
