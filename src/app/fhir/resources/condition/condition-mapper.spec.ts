import type { Condition } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import {
  clinicalStatusOf,
  conditionDisplayName,
  ConditionFormValue,
  conditionToForm,
  formToCondition,
  isConditionOf,
} from './condition-mapper';

const LOCAL = 'urn:other-hospital:diagnoses'; // a code system the form doesn't edit

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
      { system: LOCAL, code: 'ONC-17', display: 'Breast carcinoma' },
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
  icd10Code: '',
  icd10Display: '',
  icd11Code: '',
  icd11Display: '',
  clinicalStatus: '',
  verificationStatus: '',
  category: '',
  onsetDate: '',
  abatementDate: '',
  details: '',
};

describe('conditionToForm', () => {
  it('reads the fields the form edits', () => {
    expect(conditionToForm(stored)).toEqual({
      icd10Code: 'C50.9',
      icd10Display: 'Malignant neoplasm of breast, unspecified',
      icd11Code: '2C6Z',
      icd11Display: 'Malignant neoplasms of breast, unspecified',
      clinicalStatus: 'active',
      verificationStatus: 'confirmed',
      category: 'problem-list-item',
      onsetDate: '2025-02-14',
      abatementDate: '',
      details: 'Seen in MRI',
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

  it('keeps a stored name while the code is the same, and drops it when the code changes', () => {
    expect(
      formToCondition(form({ verificationStatus: 'provisional' }), patient, stored).code?.text,
    ).toBe('Breast cancer');
    // "Breast cancer" might not describe C50.4; the ICD-10 name does.
    expect(
      formToCondition(form({ icd10Code: 'C50.4' }), patient, stored).code?.text,
    ).toBeUndefined();
  });

  it('removes the ICD-10 coding when its code is cleared, keeping codings of other systems', () => {
    const condition = formToCondition(form({ icd10Code: '' }), patient, stored);

    // The local code isn't edited by the form; ICD-11 is, but wasn't changed here.
    expect(condition.code?.coding?.map((c) => c.system)).toEqual([LOCAL, CodeSystems.icd11]);
  });

  it('edits the ICD-11 coding next to the ICD-10 one', () => {
    const condition = formToCondition(
      form({ icd11Code: '2C6Y', icd11Display: 'Other specified malignant neoplasms of breast' }),
      patient,
      stored,
    );

    expect(condition.code?.coding).toEqual([
      stored.code!.coding![0],
      stored.code!.coding![1],
      {
        system: CodeSystems.icd11,
        code: '2C6Y',
        display: 'Other specified malignant neoplasms of breast',
      },
    ]);
    expect(condition.code?.text).toBeUndefined(); // a code changed: the stored name may be stale
  });

  it('edits the first note as the details, keeping the other notes', () => {
    const notes: Condition = {
      ...stored,
      note: [
        { text: 'Seen in MRI', authorString: 'Dr. B', time: '2025-02-15' },
        { text: 'Added by the RIS' },
      ],
    };

    // Unchanged: kept exactly, with its author and time.
    expect(formToCondition(form(), patient, notes).note).toEqual(notes.note);
    // Changed: the new text replaces the first note only.
    expect(formToCondition(form({ details: 'Seen in MRI, 2 cm' }), patient, notes).note).toEqual([
      { text: 'Seen in MRI, 2 cm', authorString: 'Dr. B', time: '2025-02-15' },
      { text: 'Added by the RIS' },
    ]);
    // Cleared: only the first note goes.
    expect(formToCondition(form({ details: ' ' }), patient, notes).note).toEqual([
      { text: 'Added by the RIS' },
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
        icd10Code: 'J18.9',
        icd10Display: 'Pneumonia, unspecified',
        icd11Code: 'CA40.Z',
        icd11Display: 'Pneumonia, organism unspecified',
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
        coding: [
          { system: CodeSystems.icd10, code: 'J18.9', display: 'Pneumonia, unspecified' },
          { system: CodeSystems.icd11, code: 'CA40.Z', display: 'Pneumonia, organism unspecified' },
        ],
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
  it('uses the text, then the ICD-10 display, then the reference', () => {
    expect(conditionDisplayName(stored)).toBe('Breast cancer');
    expect(conditionDisplayName({ ...stored, code: { ...stored.code, text: undefined } })).toBe(
      'Malignant neoplasm of breast, unspecified',
    );
    expect(conditionDisplayName({ resourceType: 'Condition', id: 'c9', subject: patient })).toBe(
      'Condition/c9',
    );
  });
});

describe('isConditionOf', () => {
  it("checks the condition's subject against the patient id", () => {
    expect(isConditionOf(stored, 'seed-patient-1')).toBe(true);
    expect(isConditionOf(stored, 'seed-patient-2')).toBe(false);
    expect(
      isConditionOf(
        { ...stored, subject: { reference: 'Group/seed-patient-1' } },
        'seed-patient-1',
      ),
    ).toBe(false);
  });
});
