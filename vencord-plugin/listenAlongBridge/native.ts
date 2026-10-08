/*
 * ListenAlongBridge - a tiny localhost server in Discord's main process.
 * The Spicetify extension polls it to learn what the friend you are listening along to is playing.
 */

import { IpcMainInvokeEvent } from "electron";
import { createServer, Server } from "http";

// Served to Spotify so the extension can be installed from Spicetify Marketplace's "Installed" tab.
// (Sources live in ListenAlong/spicetify; build.ps1 copies them into ./assets.)
import extensionJs from "file://assets/listenAlong.js";
import previewPng from "file://assets/preview.png?base64";
import readmeMd from "file://assets/README.md";

const ALLOWED_ORIGIN = "https://xpui.app.spotify.com";

interface BridgeState {
    target: string | null;   // user id we are listening along to
    seq: number;             // bumps on every new Listen Along click
    trackId: string | null;  // friend's current Spotify track id (null = paused / nothing playing)
    start: number;           // epoch ms when the friend's track "started" (now - start = position)
    offsetMs: number;
}

let server: Server | null = null;
let state: BridgeState = { target: null, seq: 0, trackId: null, start: 0, offsetMs: 0 };
let stopRequested = false;

export function start(_: IpcMainInvokeEvent, port: number) {
    if (server) return true;
    server = createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

        const path = (req.url ?? "").split("?")[0];   // Marketplace appends ?time=... cache busters

        if (path === "/state") {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ...state, now: Date.now() }));
        }
        if (path === "/stop" && req.method === "POST") {
            stopRequested = true;
            res.writeHead(204);
            return res.end();
        }
        if (req.method === "GET" && path === "/listenAlong.js") {
            res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
            return res.end(extensionJs);
        }
        if (req.method === "GET" && path === "/preview.png") {
            res.writeHead(200, { "Content-Type": "image/png" });
            return res.end(Buffer.from(previewPng, "base64"));
        }
        if (req.method === "GET" && path === "/README.md") {
            res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
            return res.end(readmeMd);
        }
        res.writeHead(404);
        res.end();
    });
    server.on("error", () => { server = null; });
    server.listen(port, "127.0.0.1");
    return true;
}

export function setState(_: IpcMainInvokeEvent, s: BridgeState) {
    state = s;
}

/** Returns true once if the extension asked to stop the session (user took over in Spotify). */
export function takeStopRequest(_: IpcMainInvokeEvent) {
    const r = stopRequested;
    stopRequested = false;
    return r;
}

export function stop() {
    server?.close();
    server = null;
}
