/**
 * Azure Speech (Ukrainian neural voices) -> mp3 bytes. Ported from the w2r-studio
 * TTS kit, Azure only, no ffmpeg. Adds <prosody pitch>.
 * Credentials: env AZURE_SPEECH_KEY / AZURE_SPEECH_REGION (never printed).
 */

function credentials() {
  const key = process.env.AZURE_SPEECH_KEY;
  if (!key) throw new Error('azure: AZURE_SPEECH_KEY is not set (and AZURE_SPEECH_REGION).');
  return { key, region: process.env.AZURE_SPEECH_REGION || 'westeurope' };
}

const xml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const sign = (n) => (n >= 0 ? '+' : '') + n;

/**
 * rate is a multiplier (1 = normal), pitch a percent string like "+8%".
 * `raw` = the text is already an escaped SSML fragment (e.g. with <phoneme> tags).
 */
export function buildSsml(text, voiceId, rate = 1, pitch = '0%', raw = false) {
  const locale = voiceId.split('-').slice(0, 2).join('-');
  const pct = Math.round((rate - 1) * 100);
  const p = String(pitch).trim();
  const pitchAttr = /^[+-]/.test(p) ? p : /^0/.test(p) ? '+0%' : '+' + p;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voiceId}">` +
    `<prosody rate="${sign(pct)}%" pitch="${pitchAttr}">${raw ? text : xml(text)}</prosody>` +
    `</voice></speak>`
  );
}

/** @returns {Promise<Buffer>} */
export async function synth(text, voiceId, { rate = 1, pitch = '0%', raw = false } = {}) {
  const { key, region } = credentials();
  const body = buildSsml(text, voiceId, rate, pitch, raw);

  // Free tier: 20 requests / 60 s. Back off on 429 and retry.
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'koto-tales-voice',
      },
      body,
    });
    if (res.status !== 429 || attempt >= 5) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 6000 * 2 ** attempt;
    console.warn(`  . throttled (429), waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const hint = res.status === 401 ? ' (key or region wrong)' : '';
    throw new Error(`azure: ${res.status} ${res.statusText}${hint} ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
