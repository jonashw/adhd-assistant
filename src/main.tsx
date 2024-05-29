import React from 'react'
import ReactDOM from 'react-dom/client'
import App from "./App"
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { SpeechRecognitionDemo } from './SpeechRecognitionDemo';

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />
  },
  {
    path: "/recognize",
    element: <SpeechRecognitionDemo />
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)