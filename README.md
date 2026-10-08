# Discord Listen Along for Spotify (Vencord + Spicetify)

> **Read this first: this is a two-part mod and the Spotify half alone does nothing.**
> Installing it from Spicetify Marketplace is not enough. It needs a matching plugin inside Discord (via Vencord).
> To set it up:
> 1. Install [Vencord](https://vencord.dev/download) on Discord and [Spicetify](https://spicetify.app) on Spotify.
> 2. Install `git` and Node.js 22+ (`winget install Git.Git OpenJS.NodeJS`).
> 3. Download this repo (green **Code** button > Download ZIP, or `git clone`) and run **`install.bat`**.
>
> The installer adds both halves, so you can ignore any Marketplace install button. More detail below.

Makes Discord's **Listen Along** work when Spotify accepts Discord's remote "play" command but never plays
anything (blank player). Two small mods that work together:

```
Discord friend --presence--> Vencord plugin --http://127.0.0.1:19777/state--> Spicetify extension --> Spotify's local player
```

- **`vencord-plugin/listenAlongBridge`** - Vencord plugin. Notices your Listen Along click, then publishes the
  friend's current Spotify track and position on a localhost-only server (inside Discord's main process).
- **`spicetify/listenAlong.js`** - Spicetify extension. Polls that endpoint each second, plays the same track at the
  same position, re-syncs drift, and pauses when the friend pauses. Pausing or changing track yourself in Spotify
  ends the session until your next Listen Along click.

The extension does nothing without the plugin, and the plugin needs the extension: they are one mod.

## Why

Spotify's Web API `PUT /v1/me/player/play` returns 204 for your desktop device, but the desktop app never starts
playing. Spotify's *local* player works, so this mod skips the remote command.

## Requirements

- Windows, Discord (stable) with **Vencord installed** (official installer: https://vencord.dev/download)
- Spotify desktop with **Spicetify** (https://spicetify.app), ideally with Marketplace
- `git` and Node.js 22+ (`winget install Git.Git OpenJS.NodeJS`)

A custom Vencord plugin needs Vencord built from source, which is why the installer builds it for you.

## Install / repair

```
install.bat
```

Run it again any time after Discord, Vencord, Spotify or Spicetify updates or is reinstalled. It checks that each is
present and patched, then installs the mod into both:

1. **Vencord:** backs up `%APPDATA%\Vencord\dist` and `settings.json` to `%APPDATA%\Vencord\backup-<timestamp>`,
   clones/updates Vencord into `.\vencord-src`, builds it with the plugin, deploys it, and enables the plugin.
   Discord is restarted.
2. **Spicetify:** if a Spotify update undid Spicetify's patch it runs `spicetify backup apply`, then adds
   "Listen Along (Discord)" to Marketplace's **Installed** tab (or installs it as a plain Spicetify extension if
   Marketplace is missing). Spotify is restarted.

If Discord updated, the official Vencord installer must repair Vencord *first* (the installer tells you).
Switches: `-NoUpdate` (reuse the Vencord source already downloaded), `-SkipVencord`, `-SkipSpotify`.

## Use

1. Click **Listen Along** on a friend's profile in Discord, as usual.
2. Within a few seconds Spotify starts their track at their position.
3. Pause or change track in Spotify to stop.

Plugin settings (Vencord > Plugins > ListenAlongBridge): port (default 19777) and a latency offset in ms.

## How the Marketplace entry works

Marketplace loads installed extensions from a URL. The plugin's local server also serves `listenAlong.js`,
`preview.png` and `README.md` at `http://127.0.0.1:19777/`, and the installer points the Marketplace entry there.
If Discord is closed the extension just is not loaded, which is harmless because it does nothing on its own.

## Undo

- Vencord: disable **ListenAlongBridge** in Vencord settings, or copy a `%APPDATA%\Vencord\backup-<timestamp>\dist`
  back over `%APPDATA%\Vencord\dist`.
- Spotify: Marketplace > Installed > Listen Along (Discord) > remove. (Or `spicetify config extensions listenAlong.js-`
  then `spicetify apply` if it was installed as a plain extension.)

## Security

The server binds to `127.0.0.1` only and answers cross-origin requests only for `https://xpui.app.spotify.com`.
It exposes the friend's track id and position, nothing else. The extension only talks to that address.

## Layout

```
install.bat / install.ps1        installer
manifest.json                    Spicetify Marketplace listing
scripts/                         helpers the installer calls (enable plugin, add Marketplace entry)
spicetify/                       the extension and its preview image
vencord-plugin/listenAlongBridge the Vencord plugin (index.ts, native.ts)
tools/make_preview.py            regenerates spicetify/preview.png
```

## Notes

- Listed in Spicetify Marketplace (extensions) via the topic `spicetify-extensions` and the root `manifest.json`.
  Installing the extension from Marketplace shows a one-time "one more step" dialog pointing here if the Discord
  plugin has never been found.
- Vencord has no plugin store; user plugins are shared as source, so the plugin ships in this repo and is built by
  `install.bat`. The plugin author id in `index.ts` is a placeholder (`0n`).

Not affiliated with Discord, Spotify, Vencord or Spicetify.
