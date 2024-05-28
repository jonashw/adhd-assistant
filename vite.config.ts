import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({command}) => {
  const cfg = { plugins: [react()] };
  return command === "build" 
  ? cfg
  : {
    ...cfg,
    server: {
      https: {
        key: fs.readFileSync('./.cert/key.pem'),
        cert: fs.readFileSync('./.cert/cert.pem'),
      }
    }
  }
});