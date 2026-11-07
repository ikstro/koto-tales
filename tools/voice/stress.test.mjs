import { describe, expect, it } from 'vitest';
import { applyAutoStress, applyStress, parseStressed, toIpa } from './stress.mjs';

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
    // a cluster opening the word opens the stressed syllable whole
    expect(toIpa('плутаю', 2)).toBe('ˈplutɑju');
    expect(toIpa('пиріжками', 6)).toBe('pɪriʒˈkɑmɪ');
  });

  it('says -ться, -шся, дж and doubled consonants as one sound', () => {
    expect(toIpa('прокидається', 5)).toBe('prɔkɪˈdɑjɛt͡sʲːɑ');
    expect(toIpa('смієшся', 3)).toBe('smiˈjɛsʲːɑ');
    expect(toIpa('бджоли', 3)).toBe('ˈbd͡ʒɔlɪ');
    expect(toIpa('ходжу', 4)).toBe('xɔˈd͡ʒu');
    expect(toIpa('життя', 4)).toBe('ʒɪˈtʲːɑ');
    expect(toIpa('Ванна', 1)).toBe('ˈʋɑnːɑ');
  });

  it('spells out every marked word, the dictionary winning, one-syllable words as they are', () => {
    const dict = [{ stressed: 'Пу́пся', plain: 'Пупся', stressAt: 1, ipa: 'ˈpupsʲɑ' }];
    const { ssml, used } = applyAutoStress('Пупся несе́ пиріжки́ & я плу́таю замок.', dict);
    expect(ssml).toBe(
      '<phoneme alphabet="ipa" ph="ˈpupsʲɑ">Пупся</phoneme> <phoneme alphabet="ipa" ph="nɛˈsɛ">несе</phoneme> ' +
        '<phoneme alphabet="ipa" ph="pɪriʒˈkɪ">пиріжки</phoneme> &amp; я <phoneme alphabet="ipa" ph="ˈplutɑju">плутаю</phoneme> замок.',
    );
    expect(used).toEqual(['Пу́пся']);
    expect(applyAutoStress('Пупся несе́.', dict, 'acute').ssml).toBe('Пу́пся несе́.');
  });

  it('moves the stress of мене/тебе/себе after a preposition, and lets a line entry win', () => {
    const dict = [{ stressed: 'я́йця', plain: 'яйця', stressAt: 0, ipa: 'ˈjɑjt͡sʲɑ' }];
    expect(applyAutoStress('Хто мене́ кли́че? Ході́ть до мене́, у мене́ пиріжки́.', [], 'acute').ssml).toBe(
      'Хто мене́ кли́че? Ході́ть до ме́не, у ме́не пиріжки́.',
    );
    // a comma between them is not "after a preposition"
    expect(applyAutoStress('Так, мене́.', [], 'acute').ssml).toBe('Так, мене́.');
    const line = [{ stressed: 'яйця́', plain: 'яйця', stressAt: 4, ipa: 'jɑjˈt͡sʲɑ' }];
    expect(applyAutoStress('з двох я́йця', [...dict, ...line], 'acute').ssml).toBe('з двох яйця́');
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
