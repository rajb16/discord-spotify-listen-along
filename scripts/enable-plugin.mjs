// Usage: node enable-plugin.mjs <path to Vencord settings.json> <PluginName>
// Turns the plugin on and leaves every other setting untouched (no BOM, 4-space indent like Vencord).
import fs from 'fs';
import path from 'path';
const [file, name] = process.argv.slice(2);
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : '{}';
const s = JSON.parse(text);
s.plugins ??= {};
s.plugins[name] = { ...(s.plugins[name] ?? {}), enabled: true };
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(s, null, 4), 'utf8');
console.log(`${name} enabled in ${file}`);
