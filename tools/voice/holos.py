"""
HolosTTS voice-over for the speakers marked engine "holos" in speakers.json (called by gen.mjs).

HolosTTS (patriotyk/HolosTTS, MIT, ONNX on the CPU) takes phonemes, not text, so the stress is
exactly ours: gen.mjs passes each line already stressed (auto-stress.json + stress.json), and
ipa_uk turns it into phonemes. The voices are vectors made from recordings we may use (open
studio sets, Common Voice CC0, the owner's own); they live outside git in design-lab/voices/.

Each speaker gets one pitch factor for all its lines, so a line keeps its own intonation: a
calibration sentence in the speaker's voice is measured and moved to the speaker's `hz`. Then
`rate` sets the tempo; ffmpeg's rubberband does both, loudnorm sets the loudness to the Azure lines'.

Input: a JSON file [{ id, stressed, voice, hz, rate, out }]. Prints "ok <id>" or "FAIL <id> <why>".

Setup (once):
  uv venv tools/voice/.venv --python 3.12
  uv pip install --python tools/voice/.venv/Scripts/python.exe holos-tts-onnx soundfile "git+https://github.com/patriotyk/ipa-uk.git"
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from holos_onnx import HolosTTS
from ipa_uk import ipa

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
VOICES = os.path.join(ROOT, 'design-lab', 'voices', 'voices.npz')
CALIBRATION = 'Ко́тики, приві́т! Сього́дні ми пі́демо в ліс по гриби́ і я́годи.'
LOUDNESS = 'loudnorm=I=-21:TP=-2:LRA=11'  # the Azure lines come out at about -21 LUFS; the two engines sound equally loud


def pitch_of(x, sr):
    """Median pitch in Hz by frame autocorrelation (voiced frames only)."""
    n = int(0.04 * sr)
    found = []
    for i in range(0, len(x) - n, n // 2):
        f = x[i:i + n] - x[i:i + n].mean()
        if np.sqrt((f ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(f, f, 'full')[n - 1:]
        lo, hi = int(sr / 500), int(sr / 70)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.4 * ac[0]:
            found.append(sr / k)
    return float(np.median(found)) if found else 0.0


def main():
    jobs = json.load(open(sys.argv[1], encoding='utf-8'))
    if not os.path.exists(VOICES):
        sys.exit(f'holos: no voices at {VOICES} (they are kept outside git; see design-lab/voice-bakeoff/SAVEPOINT-holos.md)')
    vecs = dict(np.load(VOICES))
    model = HolosTTS('patriotyk/HolosTTS/onnx')
    sr = model.sample_rate
    factor = {}
    tmp = tempfile.mkdtemp()
    for job in jobs:
        key = (job['voice'], job['hz'])
        try:
            voice = vecs[job['voice']]
            if key not in factor:
                cal = model.generate(ipa(CALIBRATION), voice=voice).squeeze()
                factor[key] = min(1.8, max(0.45, job['hz'] / max(pitch_of(cal, sr), 1)))
            raw = os.path.join(tmp, 'line.wav')
            sf.write(raw, model.generate(ipa(job['stressed']), voice=voice).squeeze(), sr)
            subprocess.run(
                ['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af',
                 f"rubberband=pitch={factor[key]:.3f}:tempo={job['rate']}:formant=preserved,{LOUDNESS}",
                 '-ac', '1', '-ar', '24000', '-b:a', '48k', job['out']],
                check=True,
            )
            print('ok', job['id'], flush=True)
        except Exception as e:  # one bad line must not stop the batch
            print('FAIL', job['id'], str(e).replace('\n', ' ')[:200], flush=True)


if __name__ == '__main__':
    main()
