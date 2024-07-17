import React from 'react'
import ReactDOM from 'react-dom/client'
import GraphEditor from "./GraphEditor"
import {  Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { SpeechRecognitionDemo } from './SpeechRecognitionDemo';
import { GraphRepositoryContextProvider } from './GraphRepositoryContext';
import {
  CssBaseline
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { GraphList } from './GraphList';

const defaultTheme = createTheme();

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ThemeProvider theme={defaultTheme}>
        <CssBaseline />
        <main>
          <Outlet/>
        </main>
      </ThemeProvider>
    ),
    children: [
      {
        path: "",
        index: true,
        element: <GraphList />
      },
      {
        path: "/graph/:graphId",
        element: <GraphEditor />
      }
    ]
  },
  {
    path: "/recognize",
    element: <SpeechRecognitionDemo />
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GraphRepositoryContextProvider>
      <RouterProvider router={router} />
    </GraphRepositoryContextProvider>
  </React.StrictMode>,
)