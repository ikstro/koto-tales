/**
 * npm run voice
 * src/content/lines.json -> public/voice/<id>.mp3 (+ index.json).
 * Skips lines whose hash (provider+voice+rate+pitch+text) is unchanged (tools/voice/voice-lock.json),
 * deletes mp3s whose id is gone. Pass --force to regenerate everything.
 *
 * --draft uses the same two voices through Edge Read Aloud (`uvx edge-tts`, no key).
 * That door is fine for testing at home but is not a licence to publish, so
 * the public build should be voiced through Azure. The provider is part of
 * the hash: a normal run after a draft run regenerates every line.
 *
 * PowerShell, load the credentials first:
 *   $env:AZURE_SPEECH_KEY = [Environment]::GetEnvironmentVariable('AZURE_SPEECH_KEY','User')
 *   $env:AZURE_SPEECH_REGION = [Environment]::GetEnvironmentVariable('AZURE_SPEECH_REGION','User')
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { synth as azureSynth } from './azure.mjs';
import { applyStress, loadDictionary } from './stress.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const linesPath = path.join(root, 'src/content/lines.json');
const outDir = path.join(root, 'public/voice');
const lockPath = path.join(here, 'voice-lock.json');
const speakers = JSON.parse(fs.readFileSync(path.join(here, 'speakers.json'), 'utf8'));
const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8'));
const force = process.argv.includes('--force');
const draft = process.argv.includes('--draft');
const provider = draft ? 'edge' : 'azure';

// 20 requests / 60 s on the Azure free tier -> one request every ~3.2 s.
const PACE_MS = draft ? 0 : 3300;

const run = promisify(execFile);
async function edgeSynth(text, voice, { rate, pitch }) {
  const pct = Math.round((rate - 1) * 100);
  const hz = Math.round(parseFloat(pitch) * 1.5); // edge-tts takes pitch in Hz; ~1.5 Hz per %
  const tmp = path.join(outDir, `.draft-${process.pid}.mp3`);
  await run(
    'uvx',
    ['edge-tts', '--voice', voice, `--rate=${pct >= 0 ? '+' : ''}${pct}%`, `--pitch=${hz >= 0 ? '+' : ''}${hz}Hz`, '--text', text, '--write-media', tmp],
    { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}
const synth = draft ? edgeSynth : azureSynth;

const hashOf = (sp, text) =>
  crypto.createHash('sha1').update(`${provider}|${sp.voice}|${sp.rate}|${sp.pitch}|${text}`).digest('hex').slice(0, 12);

fs.mkdirSync(outDir, { recursive: true });
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : {};
const ids = Object.keys(lines);
const stressDict = loadDictionary();

// Remove clips whose line is gone.
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith('.mp3') && !(f.slice(0, -4) in lines)) {
    fs.unlinkSync(path.join(outDir, f));
    delete lock[f.slice(0, -4)];
    console.log(`removed ${f}`);
  }
}
for (const id of Object.keys(lock)) if (!(id in lines)) delete lock[id];

let made = 0, cached = 0, chars = 0;
const failed = [];
let lastCall = 0;

for (const id of ids) {
  const { speaker, text } = lines[id];
  const sp = speakers[speaker];
  if (!sp) { failed.push(`${id}: unknown speaker ${speaker}`); continue; }
  const file = path.join(outDir, `${id}.mp3`);
  // Words from stress.json go out as IPA with the stress marked. A line without
  // such words hashes exactly as before, so adding a word re-voices only its lines.
  const { ssml, used } = draft ? { ssml: text, used: [] } : applyStress(text, stressDict);
  const hash = hashOf(sp, used.length ? ssml : text);
  if (!force && lock[id] === hash && fs.existsSync(file)) { cached++; continue; }

  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    lastCall = Date.now();
    const buf = used.length
      ? await synth(ssml, sp.voice, { rate: sp.rate, pitch: sp.pitch, raw: true })
      : await synth(text, sp.voice, { rate: sp.rate, pitch: sp.pitch });
    fs.writeFileSync(file, buf);
    lock[id] = hash;
    made++; chars += text.length;
    console.log(`ok  ${id} (${speaker}, ${(buf.length / 1024).toFixed(0)} KB)${used.length ? ' · stress: ' + used.join(', ') : ''}`);
  } catch (e) {
    failed.push(`${id}: ${e.message}`);
    console.error(`FAIL ${id}: ${e.message}`);
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n'); // keep progress on crash
}

fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
const present = ids.filter((id) => fs.existsSync(path.join(outDir, `${id}.mp3`)));
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(present) + '\n');

console.log(`\ndone: ${made} generated (${chars} chars), ${cached} unchanged, ${failed.length} failed, index ${present.length}/${ids.length}`);
if (failed.length) { console.log(failed.join('\n')); process.exitCode = 1; }
