import type { Condition, ImagingStudy } from 'fhir/r4';
import { reasonConditionIds, reasonTransaction } from './study-reasons';

const subject = { reference: 'Patient/seed-patient-2' };

// Like seed-study-2 (CT chest, done for pneumonia) and the patient's two conditions.
const ct: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-2',
  meta: { versionId: '4' },
  status: 'available',
  subject,
  description: 'CT chest without contrast',
  reasonReference: [
    { reference: 'Condition/seed-condition-3' },
    { reference: 'Observation/o1', display: 'Cough' },
  ],
};
const pneumonia: Condition = {
  resourceType: 'Condition',
  id: 'seed-condition-3',
  meta: { versionId: '2' },
  subject,
  code: { text: 'Pneumonia' },
  evidence: [{ detail: [{ reference: 'ImagingStudy/seed-study-2' }] }],
};
const diabetes: Condition = {
  resourceType: 'Condition',
  id: 'seed-condition-4',
  meta: { versionId: '7' },
  subject,
  code: { text: 'Type 2 diabetes' },
  evidence: [{ code: [{ text: 'HbA1c 8%' }] }],
};
const conditions = [pneumonia, diabetes];

describe('reasonConditionIds', () => {
  it('lists the conditions among the reasons', () => {
    expect(reasonConditionIds(ct)).toEqual(['seed-condition-3']);
  });
});

describe('reasonTransaction', () => {
  it('changes nothing when the selection is what is stored', () => {
    expect(reasonTransaction(ct, conditions, ['seed-condition-3'])).toEqual([]);
  });

  it('adds a reason on the study and the study as evidence on the condition', () => {
    const entries = reasonTransaction(ct, conditions, ['seed-condition-3', 'seed-condition-4']);

    expect(entries.map((e) => [e.request?.url, e.request?.ifMatch])).toEqual([
      ['ImagingStudy/seed-study-2', 'W/"4"'],
      ['Condition/seed-condition-4', 'W/"7"'],
    ]);
    expect((entries[0].resource as ImagingStudy).reasonReference).toEqual([
      { reference: 'Condition/seed-condition-3' },
      { reference: 'Observation/o1', display: 'Cough' },
      { reference: 'Condition/seed-condition-4', display: 'Type 2 diabetes' },
    ]);
    expect((entries[1].resource as Condition).evidence).toEqual([
      { code: [{ text: 'HbA1c 8%' }] },
      {
        detail: [{ reference: 'ImagingStudy/seed-study-2', display: 'CT chest without contrast' }],
      },
    ]);
  });

  it('removes a reason from both sides, keeping reasons that are not conditions', () => {
    const entries = reasonTransaction(ct, conditions, []);

    expect(entries.map((e) => e.request?.url)).toEqual([
      'ImagingStudy/seed-study-2',
      'Condition/seed-condition-3',
    ]);
    expect((entries[0].resource as ImagingStudy).reasonReference).toEqual([
      { reference: 'Observation/o1', display: 'Cough' },
    ]);
    // Its only evidence entry pointed to the study, so evidence is gone (FHIR allows no empty lists).
    expect((entries[1].resource as Condition).evidence).toBeUndefined();
  });

  it('keeps the other evidence of a condition when removing the study from it', () => {
    const withMore: Condition = {
      ...pneumonia,
      evidence: [
        {
          code: [{ text: 'Crackles' }],
          detail: [{ reference: 'ImagingStudy/seed-study-2' }, { reference: 'Observation/o2' }],
        },
      ],
    };
    const [, condition] = reasonTransaction(ct, [withMore, diabetes], []);

    expect((condition.resource as Condition).evidence).toEqual([
      { code: [{ text: 'Crackles' }], detail: [{ reference: 'Observation/o2' }] },
    ]);
  });

  it('repairs a link that exists on one side only', () => {
    // The study names pneumonia but pneumonia doesn't list the study as evidence.
    const [entry] = reasonTransaction(
      ct,
      [{ ...pneumonia, evidence: undefined }],
      ['seed-condition-3'],
    );

    expect(entry.request?.url).toBe('Condition/seed-condition-3');
    expect((entry.resource as Condition).evidence).toHaveLength(1);
  });

  it("ignores ids that aren't among the patient's conditions", () => {
    expect(reasonTransaction(ct, conditions, ['seed-condition-3', 'someone-else'])).toEqual([]);
  });
});
