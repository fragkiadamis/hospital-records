import type { HumanName } from 'fhir/r4';
import { formatHumanName, HumanNamePipe } from './human-name-pipe';

describe('formatHumanName', () => {
  it('joins all given names and the family name', () => {
    expect(formatHumanName([{ family: 'Andreou', given: ['Nikos', 'Petros'] }])).toBe(
      'Nikos Petros Andreou',
    );
  });

  it('prefers the official name over others', () => {
    const names: HumanName[] = [
      { use: 'nickname', given: ['Dafni'] },
      { use: 'official', family: 'Kostaki', given: ['Daphne'] },
    ];
    expect(formatHumanName(names)).toBe('Daphne Kostaki');
  });

  it('falls back to the usual name, then the first one', () => {
    expect(
      formatHumanName([
        { use: 'old', family: 'A' },
        { use: 'usual', family: 'B' },
      ]),
    ).toBe('B');
    expect(
      formatHumanName([
        { use: 'old', family: 'A' },
        { use: 'maiden', family: 'B' },
      ]),
    ).toBe('A');
  });

  it('uses the text of the chosen name when there is one', () => {
    expect(formatHumanName([{ text: 'Dr. Ilse Varga', family: 'Varga' }])).toBe('Dr. Ilse Varga');
  });

  it('copes with missing parts and missing names', () => {
    expect(formatHumanName([{ family: 'Varga' }])).toBe('Varga');
    expect(formatHumanName([{ given: ['Ilse'] }])).toBe('Ilse');
    expect(formatHumanName([])).toBe('');
    expect(formatHumanName(undefined)).toBe('');
  });
});

describe('HumanNamePipe', () => {
  it('formats the names it is given', () => {
    expect(new HumanNamePipe().transform([{ family: 'Varga', given: ['Ilse'] }])).toBe(
      'Ilse Varga',
    );
  });
});
