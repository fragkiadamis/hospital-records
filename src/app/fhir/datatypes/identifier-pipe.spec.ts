import type { Identifier } from 'fhir/r4';
import { IdentifierPipe, identifierValue } from './identifier-pipe';

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

describe('IdentifierPipe', () => {
  it('finds the identifier for the system argument', () => {
    expect(new IdentifierPipe().transform([{ system: MRN, value: 'SEED-0003' }], MRN)).toBe(
      'SEED-0003',
    );
  });
});
