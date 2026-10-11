import { formatReference, isReferenceTo, parseReference, ReferencePipe } from './reference-pipe';

describe('parseReference', () => {
  it('reads type and id from relative and absolute references', () => {
    expect(parseReference({ reference: 'Patient/seed-patient-1' })).toEqual({
      type: 'Patient',
      id: 'seed-patient-1',
    });
    expect(parseReference({ reference: 'http://localhost:8080/fhir/ImagingStudy/42' })).toEqual({
      type: 'ImagingStudy',
      id: '42',
    });
  });

  it('ignores a version in the reference', () => {
    expect(parseReference({ reference: 'Condition/c1/_history/3' })).toEqual({
      type: 'Condition',
      id: 'c1',
    });
  });

  it('is undefined for references it cannot resolve to a resource', () => {
    expect(parseReference({ reference: '#contained-1' })).toBeUndefined();
    expect(
      parseReference({ reference: 'urn:uuid:9d4f1c2e-0000-4000-8000-000000000000' }),
    ).toBeUndefined();
    expect(parseReference({ identifier: { value: 'SEED-0001' } })).toBeUndefined();
    expect(parseReference(undefined)).toBeUndefined();
  });
});

describe('isReferenceTo', () => {
  it('matches type and id in any reference form', () => {
    expect(isReferenceTo({ reference: 'Patient/p1' }, 'Patient', 'p1')).toBe(true);
    expect(
      isReferenceTo({ reference: 'http://x/fhir/Patient/p1/_history/2' }, 'Patient', 'p1'),
    ).toBe(true);
    expect(isReferenceTo({ reference: 'Patient/p1' }, 'Patient', 'p2')).toBe(false);
    expect(isReferenceTo({ reference: 'Group/p1' }, 'Patient', 'p1')).toBe(false);
    expect(isReferenceTo({ reference: 'Patient/p1' }, 'Patient', undefined)).toBe(false);
  });
});

describe('formatReference', () => {
  it('prefers the display', () => {
    expect(formatReference({ reference: 'Patient/p1', display: 'Daphne Kostaki' })).toBe(
      'Daphne Kostaki',
    );
  });

  it('falls back to Type/id, then to the raw reference or the identifier', () => {
    expect(formatReference({ reference: 'http://x/fhir/Patient/p1/_history/2' })).toBe(
      'Patient/p1',
    );
    expect(formatReference({ reference: '#contained-1' })).toBe('#contained-1');
    expect(formatReference({ identifier: { system: 'urn:artemis:mrn', value: 'SEED-0001' } })).toBe(
      'SEED-0001',
    );
    expect(formatReference({})).toBe('');
    expect(formatReference(undefined)).toBe('');
  });
});

describe('ReferencePipe', () => {
  it('formats the reference it is given', () => {
    expect(new ReferencePipe().transform({ reference: 'Condition/seed-condition-1' })).toBe(
      'Condition/seed-condition-1',
    );
  });
});
