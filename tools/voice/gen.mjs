/**
 * npm run voice
 * src/content/lines.json -> public/voice/<id>.mp3 (+ index.json).
 * Skips lines whose hash (engine + voice + its settings + what is sent) is unchanged (tools/voice/voice-lock.json),
 * deletes mp3s whose id is gone. Pass --force to regenerate everything.
 *
 * Two engines, chosen per speaker in speakers.json (the owner's call, 2026-11-10, after blind listening):
 * - "azure" (narrator, Пупся): the Azure neural voice, sent plain text. Azure stresses better by itself than
 *   with our hints; the few words it still gets wrong are listed per line in stress.json `azure` and only those
 *   go with a hint.
 * - "holos" (everyone else): HolosTTS on this computer (tools/voice/holos.py), which reads phonemes, so the stress
 *   is exactly ours: the line marked by autostress.py (tools/voice/auto-stress.json) with stress.json `words` and
 *   `lines` winning. Voices: `voice` is a voice vector (design-lab/voices/voices.npz, outside git), `hz` the pitch
 *   the speaker is moved to, `rate` the tempo.
 *
 * --only <id,id|file.json> --out <dir>: a trial — voices only those lines (a JSON file may list them as
 * [{ id }]) into <dir>, leaving public/voice, the lock and index.json alone.
 *
 * --draft voices the Azure speakers through Edge Read Aloud (`uvx edge-tts`, no key) for testing at home only;
 * the public build is voiced through Azure.
 *
 * PowerShell, load the Azure credentials first:
 *   $env:AZURE_SPEECH_KEY = [Environment]::GetEnvironmentVariable('AZURE_SPEECH_KEY','User')
 *   $env:AZURE_SPEECH_REGION = [Environment]::GetEnvironmentVariable('AZURE_SPEECH_REGION','User')
 * HolosTTS needs its own Python once: see the header of tools/voice/holos.py.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { synth as azureSynth } from './azure.mjs';
import { applyStress, loadAzureFixes, loadDictionary, loadLineDictionary, stressText } from './stress.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const linesPath = path.join(root, 'src/content/lines.json');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const trialOut = arg('--out');
const onlyArg = arg('--only');
const only = onlyArg
  ? new Set(onlyArg.endsWith('.json') ? JSON.parse(fs.readFileSync(onlyArg, 'utf8')).map((l) => l.id) : onlyArg.split(','))
  : null;
if (only && !trialOut) throw new Error('--only needs --out <dir>: a trial never writes into public/voice');
const outDir = trialOut ? path.resolve(trialOut) : path.join(root, 'public/voice');
const lockPath = path.join(here, 'voice-lock.json');
const speakers = JSON.parse(fs.readFileSync(path.join(here, 'speakers.json'), 'utf8'));
const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8'));
const force = process.argv.includes('--force') || !!trialOut;
const draft = process.argv.includes('--draft');
const holosPython = path.join(here, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

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

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

fs.mkdirSync(outDir, { recursive: true });
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : {};
const saveLock = () => { if (!trialOut) fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n'); };
const ids = Object.keys(lines).filter((id) => !only || only.has(id));
const stressDict = loadDictionary();
const lineDict = loadLineDictionary();
const azureFixes = loadAzureFixes();
const autoPath = path.join(here, 'auto-stress.json');
const autoStress = fs.existsSync(autoPath) ? JSON.parse(fs.readFileSync(autoPath, 'utf8')) : {};

// Remove clips whose line is gone.
for (const f of trialOut ? [] : fs.readdirSync(outDir)) {
  if (f.endsWith('.mp3') && !(f.slice(0, -4) in lines)) {
    fs.unlinkSync(path.join(outDir, f));
    delete lock[f.slice(0, -4)];
    console.log(`removed ${f}`);
  }
}
if (!trialOut) for (const id of Object.keys(lock)) if (!(id in lines)) delete lock[id];

let made = 0, cached = 0, chars = 0, unmarked = 0;
const failed = [];
const azureJobs = [];
const holosJobs = [];

for (const id of ids) {
  const { speaker, text } = lines[id];
  const sp = speakers[speaker];
  if (!sp) { failed.push(`${id}: unknown speaker ${speaker}`); continue; }
  const file = path.join(outDir, `${id}.mp3`);
  if (sp.engine === 'holos') {
    const marked = autoStress[id]?.text === text ? autoStress[id].stressed : null;
    if (!marked) unmarked++;
    const stressed = stressText(marked ?? text, [...stressDict, ...(lineDict[id] ?? [])]);
    const h = hash(`holos|${sp.voice}|${sp.hz}|${sp.rate}|${stressed}`);
    if (!force && lock[id] === h && fs.existsSync(file)) { cached++; continue; }
    holosJobs.push({ id, h, chars: text.length, job: { id, stressed, voice: sp.voice, hz: sp.hz, rate: sp.rate, out: file } });
  } else {
    // Plain text; only the words listed for this line in stress.json `azure` get a hint.
    const fix = draft ? null : azureFixes[id];
    const { ssml } = fix ? applyStress(text, fix) : { ssml: null };
    const provider = draft ? 'edge' : 'azure';
    const h = hash(`${provider}|${sp.voice}|${sp.rate}|${sp.pitch}|${ssml ?? text}`);
    if (!force && lock[id] === h && fs.existsSync(file)) { cached++; continue; }
    azureJobs.push({ id, h, text, ssml, sp, file });
  }
}

// Azure (or Edge for --draft), one request at a time within the free tier's pace.
let lastCall = 0;
for (const { id, h, text, ssml, sp, file } of azureJobs) {
  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    lastCall = Date.now();
    const buf = draft
      ? await edgeSynth(text, sp.voice, sp)
      : await azureSynth(ssml ?? text, sp.voice, { rate: sp.rate, pitch: sp.pitch, raw: !!ssml });
    fs.writeFileSync(file, buf);
    lock[id] = h;
    made++; chars += text.length;
    console.log(`ok  ${id} (azure ${sp.voice}, ${(buf.length / 1024).toFixed(0)} KB)${ssml ? ' · fixed' : ''}`);
  } catch (e) {
    failed.push(`${id}: ${e.message}`);
    console.error(`FAIL ${id}: ${e.message}`);
  }
  saveLock(); // keep progress on crash
}

// HolosTTS, one batch: the model loads once.
if (holosJobs.length) {
  if (!fs.existsSync(holosPython)) {
    failed.push(`holos: no Python at ${holosPython} (setup in tools/voice/holos.py) — ${holosJobs.length} lines not voiced`);
  } else {
    const batch = path.join(os.tmpdir(), `koto-holos-${process.pid}.json`);
    fs.writeFileSync(batch, JSON.stringify(holosJobs.map((j) => j.job)));
    const byId = Object.fromEntries(holosJobs.map((j) => [j.id, j]));
    const child = spawn(holosPython, ['-X', 'utf8', path.join(here, 'holos.py'), batch], {
      env: { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1', PYTHONWARNINGS: 'ignore' },
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    for await (const line of readline.createInterface({ input: child.stdout })) {
      const [status, id, ...why] = line.split(' ');
      const j = byId[id];
      if (!j) continue;
      if (status === 'ok') {
        lock[id] = j.h;
        made++; chars += j.chars;
        console.log(`ok  ${id} (holos ${j.job.voice})`);
        if (made % 20 === 0) saveLock();
      } else {
        failed.push(`${id}: ${why.join(' ')}`);
        console.error(`FAIL ${id}: ${why.join(' ')}`);
      }
      delete byId[id];
    }
    const code = await new Promise((r) => child.on('close', r));
    fs.unlinkSync(batch);
    const left = Object.keys(byId);
    if (code !== 0 || left.length) failed.push(`holos: exited ${code}, ${left.length} lines not voiced. ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

saveLock();
const present = ids.filter((id) => fs.existsSync(path.join(outDir, `${id}.mp3`)));
if (!trialOut) fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(present) + '\n');

console.log(`\ndone: ${made} generated (${chars} chars), ${cached} unchanged, ${failed.length} failed, index ${present.length}/${ids.length}`);
if (unmarked) console.log(`${unmarked} HolosTTS lines had no stress marks yet (run autostress.py: npm run voice does)`);
if (failed.length) { console.log(failed.join('\n')); process.exitCode = 1; }
