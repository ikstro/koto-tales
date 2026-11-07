"""
Marks the stress of every word in src/content/lines.json for the voice (tools/voice/gen.mjs).

The Ukrainian neural voices guess the stress of a word and often guess wrong (the owner's
report, 2026-11-07: «Соломія», «пиріжками», «плутаю»). ukrainian-word-stress (lang-uk, a
dictionary with context disambiguation) marks the stressed vowel of each word with a
combining acute; gen.mjs sends every marked word with its stress spelled out.
Words it cannot tell (names, «замок» castle / lock) stay unmarked: stress.json covers
those by hand, and this script lists the ones still left so they can be added there.

Writes tools/voice/auto-stress.json: { id: { text, stressed } }; a line whose text did not
change keeps its marking (the model is slow to load, so nothing runs when nothing changed).

Run: python tools/voice/autostress.py   (pip install --user ukrainian-word-stress)
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
LINES = os.path.join(ROOT, 'src', 'content', 'lines.json')
OUT = os.path.join(HERE, 'auto-stress.json')
DICT = os.path.join(HERE, 'stress.json')
ACUTE = '́'
VOWELS = set('аеиіоуєїюяАЕИІОУЄЇЮЯ')
WORD = re.compile(r"[^\W\d_](?:[^\W\d_]|[́'’])*", re.UNICODE)

sys.stdout.reconfigure(encoding='utf-8')


def vowels(w: str) -> int:
    return sum(1 for ch in w if ch in VOWELS)


def main() -> None:
    lines = json.load(open(LINES, encoding='utf-8'))
    old = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    todo = [k for k, v in lines.items() if old.get(k, {}).get('text') != v['text']]
    out = {k: old[k] for k in lines if k in old and k not in todo}
    if todo:
        from ukrainian_word_stress import Stressifier, StressSymbol

        stressify = Stressifier(stress_symbol=StressSymbol.CombiningAcuteAccent)
        for k in todo:
            text = lines[k]['text']
            out[k] = {'text': text, 'stressed': stressify(text)}
    json.dump(dict(sorted(out.items())), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(OUT, 'a', encoding='utf-8').write('\n')

    # what is still unmarked: words of two or more syllables that neither the model nor stress.json knows
    dic = json.load(open(DICT, encoding='utf-8'))
    plain = lambda w: w.replace(ACUTE, '').replace("'", '').replace('’', '').lower()
    known = {plain(w) for w in dic.get('words', [])}
    left = Counter()
    double = Counter()  # two marks on one word: the model knows two variants; stress.json must pick one
    for k, v in out.items():
        own = known | {plain(w) for w in dic.get('lines', {}).get(k, [])}
        for w in WORD.findall(v['stressed']):
            if plain(w) in own:
                continue
            if w.count(ACUTE) >= 2:
                double[w.lower()] += 1
            elif ACUTE not in w and vowels(w) >= 2:
                left[w.lower()] += 1
    print(f'{len(todo)} lines marked, {len(out)} in all; {len(left)} words left unmarked, {len(double)} marked twice')
    for w, n in left.most_common():
        print(f'  {w} ×{n}')
    for w, n in double.most_common():
        print(f'  {w} ×{n}  (two variants: add one to stress.json)')


if __name__ == '__main__':
    main()
