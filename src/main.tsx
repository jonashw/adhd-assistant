import React from 'react'
import ReactDOM from 'react-dom/client'
import App from "./App"
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import SpeechRecognizer from './SpeechRecognizer';

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />
  },
  {
    path: "/recognize",
    element: <SpeechRecognizer />
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)