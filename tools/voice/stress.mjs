/**
 * Stress dictionary for the Ukrainian neural voices.
 *
 * Azure's uk-UA voices guess the stress of names, diminutives and rare words
 * and sometimes guess wrong. `stress.json` lists such words written with the
 * stress marked — a combining acute after the vowel (Пу́пся) or an apostrophe
 * after the vowel (Пу'пся; an apostrophe after a consonant stays the
 * Ukrainian apostrophe, as in пір'я). Every occurrence of the word in a line
 * is sent as an IPA <phoneme> with the stress placed explicitly.
 *
 * Inflected forms are separate entries (Зомбіка ≠ Зомбік).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ACUTE = '́';
const VOWELS = 'аеиіоуєїюяАЕИІОУЄЇЮЯ';
const IOTATED = { є: 'ɛ', ї: 'i', ю: 'u', я: 'ɑ' };
const PLAIN = { а: 'ɑ', е: 'ɛ', и: 'ɪ', і: 'i', о: 'ɔ', у: 'u' };
const CONS = {
  б: 'b', в: 'ʋ', г: 'ɦ', ґ: 'g', д: 'd', ж: 'ʒ', з: 'z', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n',
  п: 'p', р: 'r', с: 's', т: 't', ф: 'f', х: 'x', ц: 't͡s', ч: 't͡ʃ', ш: 'ʃ', щ: 'ʃt͡ʃ',
};

/** "Пу́пся" / "Пу'пся" → { plain: "Пупся", stressAt: 1 } (index of the stressed vowel in plain). */
export function parseStressed(word) {
  let plain = '';
  let stressAt = -1;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === ACUTE) {
      stressAt = plain.length - 1;
      continue;
    }
    if (ch === "'" || ch === '’') {
      const prev = plain[plain.length - 1];
      if (prev && VOWELS.includes(prev)) {
        stressAt = plain.length - 1;
        continue;
      }
    }
    plain += ch;
  }
  if (stressAt < 0) throw new Error(`stress.json: "${word}" has no stress mark`);
  return { plain, stressAt };
}

/** Ukrainian spelling → IPA with ˈ before the stressed syllable (Ukrainian spelling is close to phonemic). */
export function toIpa(plain, stressAt) {
  const w = plain.toLowerCase();
  const out = []; // one entry per letter, so the stress can be placed by letter index
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const prev = w[i - 1];
    const next = w[i + 1];
    // -ться / -шся are one long soft sound: прокидається [..jɛt͡sʲːɑ], смієшся [..ʃsʲːɑ → sʲːɑ]
    if (ch === 'т' && w.startsWith('ься', i + 1)) {
      out.push('t͡sʲː', '', '', 'ɑ');
      i += 3;
      continue;
    }
    if (ch === 'ш' && w.startsWith('ся', i + 1)) {
      out.push('sʲː', '', 'ɑ');
      i += 2;
      continue;
    }
    // дж, дз inside a word are one sound: бджола [bd͡ʒɔlɑ]
    if (ch === 'д' && (next === 'ж' || next === 'з')) {
      out.push(next === 'ж' ? 'd͡ʒ' : 'd͡z', '');
      i += 1;
      continue;
    }
    // a doubled consonant is one long one: життя [ʒɪtʲːɑ], знання [znɑnʲːɑ]
    if (CONS[ch] !== undefined && ch !== 'й' && next === ch) {
      const after = w[i + 2];
      if (after in IOTATED) out.push('', CONS[ch] + 'ʲː', IOTATED[after]);
      else if (after === 'ь') out.push('', CONS[ch] + 'ʲː', '');
      else out.push('', CONS[ch] + 'ː');
      i += after in IOTATED || after === 'ь' ? 2 : 1;
      continue;
    }
    const afterConsonant = prev !== undefined && (CONS[prev] !== undefined || prev === 'ь') && prev !== 'й';
    if (ch in IOTATED) out.push((afterConsonant ? 'ʲ' : 'j') + IOTATED[ch]);
    else if (ch in PLAIN) out.push(PLAIN[ch]);
    else if (ch === 'ь') out.push('ʲ');
    else if (ch === "'" || ch === '’' || ch === '-') out.push('');
    else if (ch in CONS) out.push(CONS[ch]);
    else out.push('');
  }
  // The stress mark goes before the consonant (with its softness) that opens the stressed syllable.
  let at = stressAt;
  if (at > 0 && CONS[w[at - 1]] !== undefined) at -= 1;
  else if (at > 1 && w[at - 1] === 'ь' && CONS[w[at - 2]] !== undefined) at -= 2;
  // the second letter of дж/дз or of a doubled consonant prints nothing: the mark goes before the sound
  while (at > 0 && out[at] === '' && CONS[w[at - 1]] !== undefined) at -= 1;
  // a cluster that opens the word opens the syllable whole (ˈplu, not pˈlu)
  if ([...w.slice(0, at)].every((ch) => CONS[ch] !== undefined || ch === 'ь' || ch === "'" || ch === '’')) at = 0;
  out[at] = 'ˈ' + out[at];
  return out.join('');
}

/**
 * A line marked by autostress.py (a combining acute after each stressed vowel) → the SSML
 * fragment the voice gets: every marked word, and every stress.json word (it wins: names,
 * «замок»), goes out with its stress spelled — as IPA (`method` 'ipa') or as the word with
 * the acute kept ('acute'). Words of one syllable and unmarked words go as they are.
 */
export function applyAutoStress(stressed, dict, method = 'ipa') {
  const key = (w) => w.toLowerCase().replace(/’/g, "'");
  const byPlain = new Map(dict.map((e) => [key(e.plain), e])); // a later entry wins (a line's own words)
  const used = [];
  let ssml = '';
  let last = 0;
  let prev = ''; // the word before, when only spaces lie between
  for (const m of stressed.matchAll(/[\p{L}́'’]+/gu)) {
    const gap = stressed.slice(last, m.index);
    ssml += xml(gap);
    last = m.index + m[0].length;
    const word = m[0];
    const plain = word.replaceAll(ACUTE, '');
    const e = byPlain.get(key(plain));
    let stressAt = -1;
    if (e) {
      stressAt = e.stressAt;
      if (!used.includes(e.stressed)) used.push(e.stressed);
    } else if (word.includes(ACUTE)) stressAt = parseStressed(word).stressAt;
    // after a preposition the stress of мене/тебе/себе moves to the first syllable: до ме́не, у те́бе
    if (SHIFTING.has(key(plain)) && PREPOSITIONS.has(prev) && /^\s+$/.test(gap)) stressAt = 1;
    prev = key(plain);
    if (stressAt < 0) {
      ssml += xml(plain);
      continue;
    }
    ssml +=
      method === 'acute'
        ? xml(plain.slice(0, stressAt + 1) + ACUTE + plain.slice(stressAt + 1))
        : `<phoneme alphabet="ipa" ph="${toIpa(plain, stressAt)}">${xml(plain)}</phoneme>`;
  }
  ssml += xml(stressed.slice(last));
  return { ssml, used };
}

const SHIFTING = new Set(['мене', 'тебе', 'себе']);
const PREPOSITIONS = new Set(
  'у в до на за від про без для при біля коло із зі з по об під над через крім повз проти після поза перед між'.split(' '),
);

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const entry = (stressed) => {
  const { plain, stressAt } = parseStressed(stressed);
  return { stressed, plain, stressAt, ipa: toIpa(plain, stressAt) };
};

export function loadDictionary(file = path.join(here, 'stress.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (raw.words ?? []).map(entry);
}

/** stress.json `lines`: { lineId: entries } — words that read differently in that one line (за́мок / замо́к). */
export function loadLineDictionary(file = path.join(here, 'stress.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(raw.lines ?? {}).map(([id, words]) => [id, words.map(entry)]));
}

/**
 * Escapes a line for SSML and wraps every dictionary word in a <phoneme>.
 * Returns the SSML fragment and the entries it used (for the regeneration hash).
 */
export function applyStress(text, dict) {
  const used = [];
  // Longest words first, so "Зомбіка" wins over "Зомбік".
  const entries = [...dict].sort((a, b) => b.plain.length - a.plain.length);
  const parts = [{ text, tagged: false }];
  for (const e of entries) {
    const re = new RegExp(`(?<![\\p{L}'’])${e.plain}(?![\\p{L}'’])`, 'giu');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.tagged) continue;
      const pieces = [];
      let last = 0;
      for (const m of p.text.matchAll(re)) {
        pieces.push({ text: p.text.slice(last, m.index), tagged: false });
        pieces.push({ text: m[0], tagged: true, ipa: e.ipa });
        last = m.index + m[0].length;
        if (!used.includes(e.stressed)) used.push(e.stressed);
      }
      if (!pieces.length) continue;
      pieces.push({ text: p.text.slice(last), tagged: false });
      parts.splice(i, 1, ...pieces);
      i += pieces.length - 1;
    }
  }
  const ssml = parts.map((p) => (p.tagged ? `<phoneme alphabet="ipa" ph="${p.ipa}">${xml(p.text)}</phoneme>` : xml(p.text))).join('');
  return { ssml, used };
}
