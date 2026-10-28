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
  out[at] = 'ˈ' + out[at];
  return out.join('');
}

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function loadDictionary(file = path.join(here, 'stress.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (raw.words ?? []).map((stressed) => {
    const { plain, stressAt } = parseStressed(stressed);
    return { stressed, plain, ipa: toIpa(plain, stressAt) };
  });
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
