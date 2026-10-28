import { describe, expect, it } from 'vitest';
import { applyStress, parseStressed, toIpa } from './stress.mjs';

describe('stress dictionary', () => {
  it('reads both stress notations and keeps the Ukrainian apostrophe', () => {
    expect(parseStressed('Пу́пся')).toEqual({ plain: 'Пупся', stressAt: 1 });
    expect(parseStressed("Пу'пся")).toEqual({ plain: 'Пупся', stressAt: 1 });
    expect(parseStressed("пі'р'я").plain).toBe("пір'я");
  });

  it('builds IPA with the stress before the stressed syllable', () => {
    expect(toIpa('Пупся', 1)).toBe('ˈpupsʲɑ');
    expect(toIpa('Льоша', 2)).toBe('ˈlʲɔʃɑ');
    expect(toIpa('Соломія', 5)).toBe('sɔlɔˈmijɑ');
  });

  it('wraps whole words only, longest first, and escapes the rest', () => {
    const dict = [
      { stressed: 'Зо́мбік', plain: 'Зомбік', ipa: 'ˈzɔmbik' },
      { stressed: 'Зомбі́ка', plain: 'Зомбіка', ipa: 'zɔmˈbikɑ' },
    ];
    const { ssml, used } = applyStress('Зомбіка & Зомбік!', dict);
    expect(ssml).toBe('<phoneme alphabet="ipa" ph="zɔmˈbikɑ">Зомбіка</phoneme> &amp; <phoneme alphabet="ipa" ph="ˈzɔmbik">Зомбік</phoneme>!');
    expect(used.sort()).toEqual(['Зомбі́ка', 'Зо́мбік'].sort());
  });
});
