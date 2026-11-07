/**
 * Listens to voiced lines and reports words whose stress sounds wrong.
 *
 * A Gemini audio model hears each mp3 with the plain text (no marks, so it is not
 * led) and writes every word of two or more syllables with the stressed vowel in
 * upper case, as spoken. That is compared with the stress autostress.py marked
 * (tools/voice/auto-stress.json) and stress.json, which wins. A word the model
 * hears differently is reported.
 *
 *   node tools/voice/listen.mjs --all | --ids a,b   [--batch 20] [--model m] [--out report.json]
 *   node tools/voice/listen.mjs --dir <folder>      (samples named <id>.<way>.mp3: errors per way)
 *   node tools/voice/listen.mjs --probe             (the samples in design-lab/voice-stress)
 *
 * What was learnt (2026-11-07): the model must think to really listen — without thinking, or
 * with gemini-3.5-flash, it answers with the dictionary stress and hears nothing. gemini-3.8-flash
 * with its default thinking heard the voice's own mistakes («пирІжками», «плутАю») but misses
 * some (2 of 6 known-wrong samples), so a flagged word is a lead, not a verdict. The free tier
 * gives 20 requests a day per model, so --all packs --batch recordings into one request, stops
 * at the day's limit and goes on from listen-report.json on the next run.
 *
 * Needs GEMINI_API_KEY in the environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary, parseStressed } from './stress.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const ACUTE = '́';
const VOWELS = 'аеиіоуєїюя';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const MODEL = opt('--model', 'gemini-3.8-flash');
// thinking helps it really listen (without it the model answers with the dictionary stress)
const THINK = opt('--think');
const KEY = process.env.GEMINI_API_KEY;

const TASK = `You check Ukrainian text-to-speech recordings for wrong word stress.
Listen to the audio carefully. For every word of two or more syllables, write the word exactly as in the text but in lower case, with the vowel the speaker ACTUALLY stressed in upper case (for example: пиріжкАми, плУтаю).
Write what you hear, not the dictionary stress: these voices often stress words wrongly, and finding that is the whole point. If a word sounds unstressed or unclear, give your best guess and set "sure" to false.`;
const WORDS = `{"word":"<word as in the text>","heard":"<lower case, stressed vowel upper case>","sure":true}`;

class DayLimit extends Error {}

/** One request; returns the parsed JSON answer. */
async function ask(parts, model = MODEL) {
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      ...(THINK === undefined ? {} : { thinkingConfig: THINK === '0' ? { thinkingBudget: 0 } : { thinkingLevel: THINK } }),
    },
  };
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      continue;
    }
    if (r.ok) {
      const j = await r.json();
      const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      try {
        return JSON.parse(out);
      } catch {
        if (attempt >= 2) throw new Error(`not JSON: ${out.slice(0, 120)}`);
        continue;
      }
    }
    const text = await r.text();
    if (r.status === 429 && /PerDay/.test(text)) throw new DayLimit(`${model}: the day's free requests are used up`);
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${r.status} ${text.slice(0, 200)}`);
  }
}

const audio = (mp3) => ({ inlineData: { mimeType: 'audio/mp3', data: mp3.toString('base64') } });

/** One recording; returns [{ word, heard, sure }]. */
export async function hear(mp3, text, model = MODEL) {
  const answer = await ask(
    [audio(mp3), { text: `${TASK}\nThe recording reads this text: «${text}»\nAnswer with JSON only: {"words":[${WORDS}]}` }],
    model,
  );
  return answer.words ?? [];
}

/** Many recordings in one request: clips [{ mp3, text }] → [[{ word, heard, sure }]] in the same order. */
export async function hearMany(clips, model = MODEL) {
  const parts = [{ text: `${TASK}\nThere are ${clips.length} separate recordings, each after its number and text. Judge each one on its own.` }];
  clips.forEach((c, i) => parts.push({ text: `Recording ${i + 1}: «${c.text}»` }, audio(c.mp3)));
  parts.push({ text: `Answer with JSON only: {"recordings":[{"n":1,"words":[${WORDS}]}]} — one entry per recording, n from 1 to ${clips.length}.` });
  const answer = await ask(parts, model);
  const out = clips.map(() => null);
  for (const r of answer.recordings ?? []) if (r.n >= 1 && r.n <= clips.length) out[r.n - 1] = r.words ?? [];
  return out;
}

/** Index of the stressed vowel the model wrote in upper case, or -1. */
export function heardAt(heard) {
  for (let i = 0; i < heard.length; i++) {
    const ch = heard[i];
    if (VOWELS.includes(ch.toLowerCase()) && ch !== ch.toLowerCase()) return i;
  }
  return -1;
}

const key = (w) => w.toLowerCase().replace(/’/g, "'").replaceAll(ACUTE, '');
const syllables = (w) => [...w.toLowerCase()].filter((ch) => VOWELS.includes(ch)).length;

/** The expected stress of each word of a line: { word: stressAt } (stress.json wins). */
export function expected(stressed, dict) {
  const byPlain = new Map(dict.map((e) => [key(e.plain), e.stressAt]));
  const out = new Map();
  for (const m of stressed.matchAll(/[\p{L}́'’]+/gu)) {
    const plain = m[0].replaceAll(ACUTE, '');
    if (syllables(plain) < 2) continue;
    const k = key(plain);
    if (byPlain.has(k)) out.set(k, byPlain.get(k));
    else if (m[0].includes(ACUTE)) out.set(k, parseStressed(m[0]).stressAt);
  }
  return out;
}

/** Words the model heard with another stress: [{ word, want, heard, sure }]. */
export function compare(want, words) {
  const bad = [];
  for (const w of words) {
    const k = key(w.word ?? '');
    if (!want.has(k)) continue;
    const at = heardAt(w.heard ?? '');
    const need = want.get(k);
    if (at < 0 || at === need) continue;
    bad.push({
      word: k,
      want: k.slice(0, need) + k[need].toUpperCase() + k.slice(need + 1),
      heard: w.heard,
      sure: w.sure !== false,
    });
  }
  return bad;
}

/** Runs fn over items, at most n at a time; results in order. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

const show = (bad) => bad.map((b) => `${b.heard} (want ${b.want})${b.sure ? '' : '?'}`).join(', ');

async function main() {
  if (!KEY) throw new Error('GEMINI_API_KEY is not set');
  const dict = loadDictionary();
  if (args.includes('--probe')) {
    const dir = path.join(root, 'design-lab/voice-stress');
    const words = { Соломія: 'Соломі́я', пиріжками: 'пиріжка́ми', плутаю: 'плу́таю' };
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
    const rows = await pool(files, 6, async (f) => {
      const [w] = f.slice(0, -4).split('-');
      const words_ = await hear(fs.readFileSync(path.join(dir, f)), `Це ${w}.`).catch((e) => [{ word: w, heard: e.message.slice(0, 40) }]);
      const h = words_.find((x) => key(x.word ?? '') === key(w));
      const at = h ? heardAt(h.heard) : -1;
      return `${f.padEnd(24)} heard ${String(h?.heard).padEnd(12)} ${at === parseStressed(words[w]).stressAt ? 'right' : 'WRONG'}`;
    });
    for (const row of rows) console.log(row);
    return;
  }
  const lines = JSON.parse(fs.readFileSync(path.join(root, 'src/content/lines.json'), 'utf8'));
  const auto = JSON.parse(fs.readFileSync(path.join(here, 'auto-stress.json'), 'utf8'));
  const stressedOf = (id) => (auto[id]?.text === lines[id].text ? auto[id].stressed : lines[id].text);
  const dir = opt('--dir');
  if (dir) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
    const tally = {};
    const rows = await pool(files, 6, async (f) => {
      const [id, way] = f.split('.');
      try {
        const bad = compare(expected(stressedOf(id), dict), await hear(fs.readFileSync(path.join(dir, f)), lines[id].text));
        tally[way] = (tally[way] ?? 0) + bad.length;
        return `${f.padEnd(34)} ${show(bad) || 'ok'}`;
      } catch (e) {
        return `${f.padEnd(34)} FAIL ${e.message.slice(0, 80)}`;
      }
    });
    for (const row of rows) console.log(row);
    console.log('wrong words per way:', JSON.stringify(tally));
    return;
  }

  let ids = Object.keys(lines);
  const only = opt('--ids');
  if (only) ids = only.split(',');
  else if (!args.includes('--all')) throw new Error('give --ids a,b or --all');
  const outFile = opt('--out', path.join(here, 'listen-report.json'));
  const report = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  const fileOf = (id) => path.join(root, 'public/voice', `${id}.mp3`);
  const queue = ids.filter((id) => {
    if (!fs.existsSync(fileOf(id)) || expected(stressedOf(id), dict).size === 0) return false;
    const r = report[id];
    return only || !(r && r.mtime === fs.statSync(fileOf(id)).mtimeMs && r.text === lines[id].text);
  });
  const BATCH = Number(opt('--batch', '20'));
  console.log(`${queue.length} recordings to hear, ${BATCH} a request`);
  let heard = 0;
  let flagged = 0;
  try {
    for (let i = 0; i < queue.length; i += BATCH) {
      const chunk = queue.slice(i, i + BATCH);
      const answers = await hearMany(
        chunk.map((id) => ({ mp3: fs.readFileSync(fileOf(id)), text: lines[id].text })),
      );
      chunk.forEach((id, k) => {
        if (!answers[k]) return; // the model skipped it: heard again next run
        const bad = compare(expected(stressedOf(id), dict), answers[k]);
        report[id] = { text: lines[id].text, model: MODEL, mtime: fs.statSync(fileOf(id)).mtimeMs, bad };
        heard++;
        if (bad.length) {
          flagged++;
          console.log(`${id}: ${show(bad)}`);
        }
      });
      fs.writeFileSync(outFile, JSON.stringify(report, null, 1) + '\n');
      console.log(`… ${Math.min(i + BATCH, queue.length)}/${queue.length}`);
    }
  } catch (e) {
    if (!(e instanceof DayLimit)) throw e;
    console.log(`${e.message}; run again tomorrow, it goes on from the report`);
  }
  const left = queue.length - heard;
  console.log(`\nheard ${heard}, flagged ${flagged}, left ${left} → ${path.relative(root, outFile)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
