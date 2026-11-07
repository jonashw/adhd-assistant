import React from 'react'
import ReactDOM from 'react-dom/client'
import GraphEditor from "./GraphEditor"
import {  Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { SpeechRecognitionDemo } from './SpeechRecognitionDemo';
import { GraphRepositoryContextProvider } from './GraphRepositoryContext';
import {
  CssBaseline
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { GraphList } from './GraphList';
import { SignInGate } from './SignInGate';
import { CrewPreview } from './CrewPreview';
import { TemplatePicker } from './templates/TemplatePicker';
import { ClaudeMap } from './ClaudeMap';
import { hideSplash } from './splash';
import { ColorModeContext, useColorModeState } from './theme';
import './theme.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <main>
        <SignInGate>
          <Outlet/>
        </SignInGate>
      </main>
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
      },
      {
        path: "/templates",
        element: <TemplatePicker />
      },
      {
        path: "/claude",
        element: <ClaudeMap />
      }
    ]
  },
  {
    path: "/crew",
    element: <CrewPreview />
  },
  {
    path: "/recognize",
    element: <SpeechRecognitionDemo />
  },
]);

/* Light or dark: follows the device unless a pick is kept (the Claude map's settings menu has it) */
function Themed({children}: {children: React.ReactNode}) {
  const {choice, mode, setChoice, theme} = useColorModeState();
  const value = React.useMemo(() => ({choice, mode, setChoice}), [choice, mode, setChoice]);
  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Themed>
      <GraphRepositoryContextProvider>
        <RouterProvider router={router} />
      </GraphRepositoryContextProvider>
    </Themed>
  </React.StrictMode>,
)

// Pages outside the sign-in gate (the crew preview, the speech demo) don't wait on it,
// and if the gate is ever slow the loading screen still steps aside after a few seconds.
if (/^\/(crew|recognize)/.test(window.location.pathname)) hideSplash();
else window.setTimeout(hideSplash, 8000);
