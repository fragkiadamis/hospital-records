import { referenceLink } from './resource-links';

describe('referenceLink', () => {
  it("links to the target's page under the patient", () => {
    expect(referenceLink({ reference: 'ImagingStudy/seed-study-1' }, 'seed-patient-1')).toEqual({
      text: 'Imaging study seed-study-1',
      link: ['/patients', 'seed-patient-1', 'studies', 'seed-study-1'],
    });
    expect(
      referenceLink(
        { reference: 'Condition/seed-condition-1', display: 'Breast cancer' },
        'seed-patient-1',
      ),
    ).toEqual({
      text: 'Breast cancer',
      link: ['/patients', 'seed-patient-1', 'conditions', 'seed-condition-1'],
    });
  });

  it('gives only text without a patient, or for targets without a page', () => {
    expect(referenceLink({ reference: 'ImagingStudy/s1' })).toEqual({ text: 'Imaging study s1' });
    expect(referenceLink({ reference: 'Observation/o1' }, 'p1')).toEqual({
      text: 'Observation o1',
    });
    expect(referenceLink({ reference: '#contained' }, 'p1')).toEqual({ text: '#contained' });
  });
});
