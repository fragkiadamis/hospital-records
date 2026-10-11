import type { CodeableConcept } from 'fhir/r4';
import { CodeableConceptPipe, findCoding, formatCodeableConcept } from './codeable-concept-pipe';

const ICD11 = 'http://id.who.int/icd/release/11/mms';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10';

// Like seed-condition-1, without the text.
const breastCancer: CodeableConcept = {
  coding: [
    { system: ICD11, code: '2C6Z', display: 'Malignant neoplasm of breast' },
    { system: ICD10, code: 'C50.9', display: 'Malignant neoplasm of breast, unspecified' },
  ],
};

describe('findCoding', () => {
  it('returns the coding of the given system', () => {
    expect(findCoding(breastCancer, ICD10)?.code).toBe('C50.9');
    expect(findCoding(breastCancer, 'urn:other')).toBeUndefined();
    expect(findCoding(undefined, ICD11)).toBeUndefined();
  });
});

describe('formatCodeableConcept', () => {
  it('prefers the text', () => {
    expect(formatCodeableConcept({ ...breastCancer, text: 'Breast cancer' })).toBe('Breast cancer');
  });

  it("falls back to the first coding's display, or to the preferred system's", () => {
    expect(formatCodeableConcept(breastCancer)).toBe('Malignant neoplasm of breast');
    expect(formatCodeableConcept(breastCancer, ICD10)).toBe(
      'Malignant neoplasm of breast, unspecified',
    );
  });

  it('skips codings without a display before settling for a bare code', () => {
    expect(
      formatCodeableConcept({
        coding: [
          { system: ICD10, code: 'C50.9' },
          { system: ICD11, display: 'Breast cancer' },
        ],
      }),
    ).toBe('Breast cancer');
    expect(formatCodeableConcept({ coding: [{ system: ICD10, code: 'C50.9' }] })).toBe('C50.9');
  });

  it('gives an empty string when there is nothing to show', () => {
    expect(formatCodeableConcept({})).toBe('');
    expect(formatCodeableConcept(undefined)).toBe('');
  });
});

describe('CodeableConceptPipe', () => {
  const pipe = new CodeableConceptPipe();

  it('formats one concept', () => {
    expect(pipe.transform(breastCancer, ICD10)).toBe('Malignant neoplasm of breast, unspecified');
  });

  it('joins a list of concepts, leaving out empty ones', () => {
    expect(
      pipe.transform([
        { coding: [{ code: 'problem-list-item', display: 'Problem List Item' }] },
        {},
        { text: 'Encounter diagnosis' },
      ]),
    ).toBe('Problem List Item, Encounter diagnosis');
    expect(pipe.transform(undefined)).toBe('');
  });
});
