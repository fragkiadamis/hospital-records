import type { Condition } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import {
  clinicalStatusOf,
  conditionDisplayName,
  ConditionFormValue,
  conditionToForm,
  formToCondition,
} from './condition-mapper';

const patient = { reference: 'Patient/seed-patient-1', display: 'Daphne Kostaki' };

// Like seed-condition-1, plus fields the form does not edit.
const stored: Condition = {
  resourceType: 'Condition',
  id: 'seed-condition-1',
  meta: { versionId: '2' },
  clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
  verificationStatus: {
    coding: [
      { system: CodeSystems.conditionVerification, code: 'confirmed', display: 'Confirmed' },
    ],
  },
  category: [
    { coding: [{ system: CodeSystems.conditionCategory, code: 'problem-list-item' }] },
    { text: 'Oncology' },
  ],
  code: {
    coding: [
      { system: CodeSystems.snomed, code: '254837009', display: 'Malignant neoplasm of breast' },
      {
        system: CodeSystems.icd10,
        code: 'C50.9',
        display: 'Malignant neoplasm of breast, unspecified',
      },
      {
        system: CodeSystems.icd11,
        code: '2C6Z',
        display: 'Malignant neoplasms of breast, unspecified',
      },
    ],
    text: 'Breast cancer',
  },
  subject: patient,
  onsetDateTime: '2025-02-14',
  evidence: [{ detail: [{ reference: 'ImagingStudy/seed-study-1' }] }],
  note: [{ text: 'Seen in MRI' }],
};

const form = (changes: Partial<ConditionFormValue> = {}): ConditionFormValue => ({
  ...conditionToForm(stored),
  ...changes,
});

const empty: ConditionFormValue = {
  text: '',
  snomedCode: '',
  snomedDisplay: '',
  icd10Code: '',
  icd10Display: '',
  clinicalStatus: '',
  verificationStatus: '',
  category: '',
  onsetDate: '',
  abatementDate: '',
};

describe('conditionToForm', () => {
  it('reads the fields the form edits', () => {
    expect(conditionToForm(stored)).toEqual({
      text: 'Breast cancer',
      snomedCode: '254837009',
      snomedDisplay: 'Malignant neoplasm of breast',
      icd10Code: 'C50.9',
      icd10Display: 'Malignant neoplasm of breast, unspecified',
      clinicalStatus: 'active',
      verificationStatus: 'confirmed',
      category: 'problem-list-item',
      onsetDate: '2025-02-14',
      abatementDate: '',
    });
  });

  it('leaves onset empty when it is stored as something other than a date', () => {
    expect(
      conditionToForm({ ...stored, onsetDateTime: undefined, onsetString: 'childhood' }).onsetDate,
    ).toBe('');
  });
});

describe('formToCondition', () => {
  it('changes nothing when the form is saved unedited', () => {
    expect(JSON.parse(JSON.stringify(formToCondition(form(), patient, stored)))).toEqual(stored);
  });

  it('keeps the subject, evidence, notes and other codings and categories', () => {
    const condition = formToCondition(
      form({ icd10Code: 'C50.4', icd10Display: '' }),
      patient,
      stored,
    );

    expect(condition.subject).toBe(stored.subject);
    expect(condition.evidence).toEqual(stored.evidence);
    expect(condition.note).toEqual(stored.note);
    expect(condition.meta).toEqual({ versionId: '2' });
    expect(condition.category?.[1]).toEqual({ text: 'Oncology' });
    expect(condition.code?.coding).toEqual([
      stored.code!.coding![0],
      { system: CodeSystems.icd10, code: 'C50.4', display: undefined },
      stored.code!.coding![2],
    ]);
  });

  it('removes a coding whose code is cleared', () => {
    const condition = formToCondition(form({ snomedCode: '' }), patient, stored);

    expect(condition.code?.coding?.map((c) => c.system)).toEqual([
      CodeSystems.icd10,
      CodeSystems.icd11,
    ]);
  });

  it('replaces a status only when its code changes', () => {
    expect(formToCondition(form(), patient, stored).verificationStatus).toBe(
      stored.verificationStatus,
    );
    const resolved = formToCondition(form({ clinicalStatus: 'resolved' }), patient, stored);
    expect(resolved.clinicalStatus).toEqual({
      coding: [{ system: CodeSystems.conditionClinical, code: 'resolved' }],
    });
    expect(clinicalStatusOf(resolved)).toBe('resolved');
  });

  it('replaces only the HL7 category', () => {
    const condition = formToCondition(form({ category: 'encounter-diagnosis' }), patient, stored);

    expect(condition.category).toEqual([
      { coding: [{ system: CodeSystems.conditionCategory, code: 'encounter-diagnosis' }] },
      { text: 'Oncology' },
    ]);
  });

  it('sets dates, and keeps a stored onset the form cannot show unless a date replaces it', () => {
    const withAge: Condition = { ...stored, onsetDateTime: undefined, onsetAge: { value: 45 } };

    expect(formToCondition(form({ onsetDate: '' }), patient, withAge).onsetAge).toEqual({
      value: 45,
    });

    const dated = formToCondition(
      form({ onsetDate: '2025-01-10', abatementDate: '2026-02-20' }),
      patient,
      withAge,
    );
    expect(dated.onsetDateTime).toBe('2025-01-10');
    expect(dated.onsetAge).toBeUndefined();
    expect(dated.abatementDateTime).toBe('2026-02-20');
  });

  it('builds a new condition for the given patient', () => {
    const condition = formToCondition(
      {
        ...empty,
        text: 'Pneumonia',
        snomedCode: '233604007',
        snomedDisplay: 'Pneumonia',
        clinicalStatus: 'active',
        category: 'encounter-diagnosis',
        onsetDate: '2026-01-08',
      },
      patient,
    );

    expect(JSON.parse(JSON.stringify(condition))).toEqual({
      resourceType: 'Condition',
      subject: patient,
      code: {
        coding: [{ system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' }],
        text: 'Pneumonia',
      },
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      category: [
        { coding: [{ system: CodeSystems.conditionCategory, code: 'encounter-diagnosis' }] },
      ],
      onsetDateTime: '2026-01-08',
    });
  });

  it('never sends empty arrays or an empty code', () => {
    const condition = formToCondition(empty, patient);

    expect(condition.code).toBeUndefined();
    expect(condition.category).toBeUndefined();
    expect(condition.clinicalStatus).toBeUndefined();
  });
});

describe('conditionDisplayName', () => {
  it('uses the text, then the SNOMED display, then the reference', () => {
    expect(conditionDisplayName(stored)).toBe('Breast cancer');
    expect(conditionDisplayName({ ...stored, code: { ...stored.code, text: undefined } })).toBe(
      'Malignant neoplasm of breast',
    );
    expect(conditionDisplayName({ resourceType: 'Condition', id: 'c9', subject: patient })).toBe(
      'Condition/c9',
    );
  });
});
