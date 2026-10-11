import type { Identifier } from 'fhir/r4';
import { identifierLabel, IdentifierPipe, identifierValue } from './identifier-pipe';

const MRN = 'urn:artemis:mrn';

describe('identifierValue', () => {
  const identifiers: Identifier[] = [
    { system: 'urn:other:hospital', value: 'X-77' },
    { system: MRN, value: 'SEED-0001' },
  ];

  it('returns the value issued under the given system', () => {
    expect(identifierValue(identifiers, MRN)).toBe('SEED-0001');
  });

  it('returns an empty string when there is no identifier for that system', () => {
    expect(identifierValue(identifiers, 'urn:unknown')).toBe('');
    expect(identifierValue([{ system: MRN }], MRN)).toBe('');
    expect(identifierValue(undefined, MRN)).toBe('');
  });
});

describe('identifierLabel', () => {
  it("prefers the identifier's own type label", () => {
    expect(
      identifierLabel({ system: MRN, type: { text: 'Hospital number' } }, { [MRN]: 'MRN' }),
    ).toBe('Hospital number');
    expect(
      identifierLabel({
        type: { coding: [{ code: 'PPN', display: 'Passport number' }] },
        system: 'urn:x',
      }),
    ).toBe('Passport number');
  });

  it('then the label the caller knows for the system, then the system itself', () => {
    expect(identifierLabel({ system: MRN, value: '1' }, { [MRN]: 'MRN' })).toBe('MRN');
    expect(identifierLabel({ system: 'urn:other:hospital', value: '1' })).toBe(
      'urn:other:hospital',
    );
    expect(identifierLabel({ value: '1' })).toBe('Identifier');
  });
});

describe('IdentifierPipe', () => {
  it('finds the identifier for the system argument', () => {
    expect(new IdentifierPipe().transform([{ system: MRN, value: 'SEED-0003' }], MRN)).toBe(
      'SEED-0003',
    );
  });
});
