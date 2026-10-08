// Adds "Listen Along (Discord)" to Spicetify Marketplace's Installed tab.
// Needs Spotify running with --remote-debugging-port=<port>. Marketplace keeps its installed items in the
// IndexedDB database "spicetify-marketplace" (store "settings", records {key, value}).
// Usage: node marketplace-entry.mjs <port> <path to manifest.json> <github user> <repo>
// Exit codes: 0 ok, 3 Marketplace database not found (not installed / never opened), 1 other error.
import fs from 'fs';
import path from 'path';
const [port, manifestPath, user, repo] = process.argv.slice(2);
const BASE = 'http://127.0.0.1:19777';          // served by the ListenAlongBridge Vencord plugin
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))[0];
const key = `marketplace:installed:${user}/${repo}/${m.main}`;
const entry = {
  manifest: m, type: 'extension', title: m.name, subtitle: m.description, authors: m.authors,
  user, repo, branch: 'main',
  imageURL: `${BASE}/${path.basename(m.preview)}`, extensionURL: `${BASE}/${path.basename(m.main)}`, readmeURL: `${BASE}/${path.basename(m.readme)}`,
  stars: 0, tags: m.tags,
};

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('xpui'));
if (!page) { console.error('Spotify page not found on debug port'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = e => { const d = JSON.parse(e.data); if (pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const ev = expr => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); });

const js = `(async () => {
  const dbs = await indexedDB.databases();
  if (!dbs.some(d => d.name === "spicetify-marketplace")) return { missing: true };
  const db = await new Promise((res, rej) => { const q = indexedDB.open("spicetify-marketplace"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  if (![...db.objectStoreNames].includes("settings")) return { missing: true };
  const get = k => new Promise(r => { const q = db.transaction("settings").objectStore("settings").get(k); q.onsuccess = () => r(q.result && q.result.value); });
  const listKey = "marketplace:installed-extensions";
  const list = JSON.parse((await get(listKey)) || "[]");
  const stale = list.filter(k => k !== ${JSON.stringify(key)} && /listen-?along/i.test(k));
  const next = list.filter(k => !stale.includes(k));
  if (!next.includes(${JSON.stringify(key)})) next.push(${JSON.stringify(key)});
  const tx = db.transaction("settings", "readwrite"); const st = tx.objectStore("settings");
  st.put({ key: ${JSON.stringify(key)}, value: ${JSON.stringify(JSON.stringify(entry))} });
  st.put({ key: listKey, value: JSON.stringify(next) });
  for (const k of stale) st.delete(k);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  const back = JSON.parse(await get(listKey));
  return { ok: back.includes(${JSON.stringify(key)}), removedStale: stale.length, total: back.length };
})()`;
const r = (await ev(js)).result.value;
if (!r || r.missing) { console.error('Marketplace database not found'); process.exit(3); }
console.log(JSON.stringify(r));
await new Promise(res => setTimeout(res, 3000));   // let Spotify flush the database to disk
process.exit(r.ok ? 0 : 1);
