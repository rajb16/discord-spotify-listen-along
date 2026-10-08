// Listen Along (local) - Spicetify extension.
// Polls the Vencord "ListenAlongBridge" plugin on 127.0.0.1 and plays what the Discord friend is
// playing through Spotify's local player. Works even when Spotify ignores Discord's remote
// "play" command (the reason Discord's own Listen Along shows a blank player).
(function ListenAlong() {
    if (!(window.Spicetify && Spicetify.Player && Spicetify.Platform && Spicetify.Platform.PlayerAPI)) {
        setTimeout(ListenAlong, 300);
        return;
    }
    if (window.__listenAlongTimer) clearInterval(window.__listenAlongTimer);

    const BASE = "http://127.0.0.1:19777";
    const POLL_MS = 1000;
    const DRIFT_MS = 2500;        // re-seek if we are further than this from the friend
    const GRACE_MS = 4000;        // after we start a track, ignore state changes for a bit
    const PlayerAPI = Spicetify.Platform.PlayerAPI;

    const REPO_URL = "https://github.com/rajb16/discord-spotify-listen-along";
    const NOTICE_AFTER_MISSES = 30;   // ~30 s without ever finding the Discord plugin
    let misses = 0;

    let lastSeq = -1;
    let applied = null;           // { trackId, at } of the track we last started
    let override = false;         // user took control in Spotify; stay out of the way until a new session
    let pausedByUs = false;
    let busy = false;

    const currentUri = () => (Spicetify.Player.data && Spicetify.Player.data.item && Spicetify.Player.data.item.uri) || "";

    const store = {
        get: k => { try { return localStorage.getItem("listenAlong:" + k); } catch { return null; } },
        set: (k, v) => { try { localStorage.setItem("listenAlong:" + k, v); } catch { } }
    };

    // Installing only this half (e.g. from Marketplace) does nothing, so say so - once, and never to
    // anyone whose Discord plugin has answered at least once.
    function showSetupNotice() {
        if (store.get("noticeShown") || store.get("bridgeSeen")) return;
        store.set("noticeShown", "1");
        const box = document.createElement("div");
        box.style.cssText = "line-height:1.5;font-size:14px;max-width:460px";
        box.innerHTML =
            "<p>This extension is only half of <b>Listen Along (Discord)</b>. It needs its matching Vencord plugin in Discord, " +
            "which can't be installed from here.</p>" +
            "<p>Open the project page, follow the install steps (run <b>install.bat</b>), and then restart Spotify:</p>" +
            "<p><a href='" + REPO_URL + "' target='_blank' style='color:var(--text-bright-accent,#1ed760);text-decoration:underline'>" + REPO_URL + "</a></p>" +
            "<p style='opacity:.7'>You will only see this message once.</p>";
        Spicetify.PopupModal.display({ title: "Listen Along (Discord): one more step", content: box });
    }

    async function getState() {
        try {
            const r = await fetch(BASE + "/state", { cache: "no-store" });
            if (!r.ok) throw new Error(String(r.status));
            if (!store.get("bridgeSeen")) store.set("bridgeSeen", "1");
            misses = 0;
            return await r.json();
        } catch {
            if (++misses === NOTICE_AFTER_MISSES) showSetupNotice();
            return null;               // plugin / Discord not running
        }
    }

    function stopSession(reason) {
        override = true;
        fetch(BASE + "/stop", { method: "POST" }).catch(() => {});
        console.log("[ListenAlong] stopped:", reason);
    }

    async function startTrack(uri, positionMs) {
        try {
            await PlayerAPI.play({ uri }, {}, { seekTo: Math.max(0, Math.floor(positionMs)) });
        } catch (e) {
            await Spicetify.Player.playUri(uri);
            Spicetify.Player.seek(Math.max(0, Math.floor(positionMs)));
        }
    }

    async function tick() {
        if (busy) return;
        busy = true;
        try {
            const s = await getState();
            if (!s || !s.target) { applied = null; pausedByUs = false; return; }

            if (s.seq !== lastSeq) {         // a new Listen Along click
                lastSeq = s.seq;
                override = false;
                applied = null;
                pausedByUs = false;
            }
            if (override) return;

            // Friend paused / stopped: pause once, resume when they play again.
            if (!s.trackId) {
                if (applied && !pausedByUs) { Spicetify.Player.pause(); pausedByUs = true; }
                return;
            }

            const uri = "spotify:track:" + s.trackId;
            const pos = s.now - s.start + (s.offsetMs || 0);

            if (!applied || applied.trackId !== s.trackId || pausedByUs) {
                applied = { trackId: s.trackId, at: Date.now() };
                pausedByUs = false;
                await startTrack(uri, pos);
                return;
            }

            if (Date.now() - applied.at < GRACE_MS) return;

            // The user changed track or paused in Spotify: hand control back.
            if (currentUri() !== uri) return stopSession("track changed in Spotify");
            if (!Spicetify.Player.isPlaying()) return stopSession("paused in Spotify");

            if (Math.abs(Spicetify.Player.getProgress() - pos) > DRIFT_MS) Spicetify.Player.seek(Math.max(0, pos));
        } finally {
            busy = false;
        }
    }

    window.__listenAlongTimer = setInterval(tick, POLL_MS);
    console.log("[ListenAlong] extension running");
})();
