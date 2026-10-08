/*
 * ListenAlongBridge - Vencord userplugin.
 * When you click "Listen Along" on a friend, remember who it is and keep publishing their current
 * Spotify track + position to a localhost endpoint that the Spicetify "listenAlong.js" extension plays.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findStoreLazy } from "@webpack";

const Native = VencordNative.pluginHelpers.ListenAlongBridge as PluginNative<typeof import("./native")>;

const SpotifyStore = findStoreLazy("SpotifyStore");
const PresenceStore = findStoreLazy("PresenceStore");

const settings = definePluginSettings({
    port: {
        type: OptionType.NUMBER,
        description: "Local port (must match PORT in listenAlong.js)",
        default: 19777,
        restartNeeded: true
    },
    offsetMs: {
        type: OptionType.NUMBER,
        description: "Latency compensation in ms (add if you hear yourself slightly behind the friend)",
        default: 800
    }
});

let timer: ReturnType<typeof setInterval> | null = null;
let target: string | null = null;
let seq = 0;

function spotifyActivity(userId: string) {
    const acts: any[] = PresenceStore.getActivities(userId) ?? [];
    return acts.find(a => a.type === 2 && a.name === "Spotify" && a.sync_id);
}

async function tick() {
    // Discord's own Listen Along flags who we're syncing with. Latch onto it, and keep our session
    // even after Discord gives up (it does so when Spotify never reports the track as playing).
    const syncing = SpotifyStore.getSyncingWith?.();
    if (syncing?.userId && syncing.userId !== target) {
        target = syncing.userId;
        seq++;
    }

    if (await Native.takeStopRequest()) target = null;

    const act = target ? spotifyActivity(target) : null;
    await Native.setState({
        target,
        seq,
        trackId: act?.sync_id ?? null,
        start: act?.timestamps?.start ?? 0,
        offsetMs: settings.store.offsetMs
    });
}

export default definePlugin({
    name: "ListenAlongBridge",
    description: "Makes Listen Along work by sending the friend's track and position to a Spicetify extension that plays it locally",
    authors: [{ name: "rajb16", id: 0n }],
    settings,

    async start() {
        await Native.start(settings.store.port);
        timer = setInterval(() => tick().catch(() => { }), 1000);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = null;
        target = null;
        Native.stop();
    }
});
