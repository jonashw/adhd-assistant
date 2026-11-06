var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from "fs";
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var command = _a.command;
    var cfg = { plugins: [react()] };
    return command === "build"
        ? cfg
        : __assign(__assign({}, cfg), { server: {
                https: {
                    key: fs.readFileSync('./.cert/key.pem'),
                    cert: fs.readFileSync('./.cert/cert.pem'),
                }
            } });
});
