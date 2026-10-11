import type { Identifier, Patient } from 'fhir/r4';
import {
  DICOM_PATIENT_ID_SYSTEM,
  dicomPatientIdentifier,
  formToPatient,
  MRN_SYSTEM,
  patientDisplayName,
  PatientFormValue,
  patientToForm,
} from './patient-mapper';

// Shaped like seed-patient-2, plus fields the form does not edit.
const stored: Patient = {
  resourceType: 'Patient',
  id: 'seed-patient-2',
  meta: { versionId: '4' },
  active: true,
  identifier: [
    { system: 'urn:other:hospital', value: 'X-77' },
    { system: MRN_SYSTEM, value: 'SEED-0002' },
  ],
  name: [
    { use: 'official', family: 'Andreou', given: ['Nikos', 'Petros'], prefix: ['Mr'] },
    { use: 'nickname', given: ['Nick'] },
  ],
  gender: 'male',
  birthDate: '1955-11-03',
  telecom: [
    { system: 'phone', value: '+30 210 000 0002', use: 'mobile' },
    { system: 'phone', value: '+30 210 999 9999', use: 'work' },
  ],
  address: [{ city: 'Athens' }],
};

const form = (changes: Partial<PatientFormValue> = {}): PatientFormValue => ({
  ...patientToForm(stored),
  ...changes,
});

describe('patientToForm', () => {
  it('reads the fields the form edits', () => {
    expect(patientToForm(stored)).toEqual({
      given: 'Nikos Petros',
      family: 'Andreou',
      gender: 'male',
      birthDate: '1955-11-03',
      phone: '+30 210 000 0002',
      email: '',
      identifiers: { mrn: 'SEED-0002', dicomPatientId: '' },
    });
  });

  it('gives empty strings for a patient with nothing filled in', () => {
    expect(patientToForm({ resourceType: 'Patient' })).toEqual({
      given: '',
      family: '',
      gender: '',
      birthDate: '',
      phone: '',
      email: '',
      identifiers: { mrn: '', dicomPatientId: '' },
    });
  });
});

describe('formToPatient', () => {
  it('changes nothing when the form is saved unedited', () => {
    expect(formToPatient(form(), stored)).toEqual(stored);
  });

  it('keeps id, meta and fields the form does not edit', () => {
    const patient = formToPatient(form({ birthDate: '1955-11-04' }), stored);

    expect(patient.id).toBe('seed-patient-2');
    expect(patient.meta).toEqual({ versionId: '4' }); // sent as If-Match by FhirClient.update
    expect(patient.address).toEqual([{ city: 'Athens' }]);
    expect(patient.birthDate).toBe('1955-11-04');
  });

  it('keeps the DICOM Patient ID when the MRN is edited, since the two are separate', () => {
    const synced: Patient = {
      ...stored,
      identifier: [
        dicomPatientIdentifier('KiTS-00136'),
        { system: MRN_SYSTEM, value: 'SEED-0002' },
      ],
    };

    const patient = formToPatient(
      form({ identifiers: { mrn: 'MRN-42', dicomPatientId: 'KiTS-00136' } }),
      synced,
    );

    expect(patient.identifier).toEqual([
      dicomPatientIdentifier('KiTS-00136'),
      { system: MRN_SYSTEM, value: 'MRN-42' },
    ]);
  });

  it('reads and edits the DICOM Patient ID like the MRN', () => {
    const synced: Patient = { ...stored, identifier: [dicomPatientIdentifier('KiTS-00136')] };
    expect(patientToForm(synced).identifiers).toEqual({ mrn: '', dicomPatientId: 'KiTS-00136' });

    const edited = formToPatient(
      form({ identifiers: { mrn: '', dicomPatientId: 'KiTS-00137' } }),
      synced,
    );
    // Edited in place: still typed PI.
    expect(edited.identifier).toEqual([dicomPatientIdentifier('KiTS-00137')]);
  });

  it('adds a DICOM Patient ID typed PI, which links the patient to their PACS studies', () => {
    const patient = formToPatient(
      form({ identifiers: { mrn: 'SEED-0002', dicomPatientId: ' TEST-0042 ' } }),
      stored,
    );

    expect(patient.identifier).toEqual([
      { system: 'urn:other:hospital', value: 'X-77' },
      { system: MRN_SYSTEM, value: 'SEED-0002' },
      dicomPatientIdentifier('TEST-0042'),
    ]);
    expect(patient.identifier?.at(-1)?.system).toBe(DICOM_PATIENT_ID_SYSTEM);
  });

  it('edits the preferred name in place and keeps the other names', () => {
    const patient = formToPatient(form({ given: 'Nikolaos', family: 'Andreou' }), stored);

    expect(patient.name).toEqual([
      { use: 'official', family: 'Andreou', given: ['Nikolaos'], prefix: ['Mr'] },
      { use: 'nickname', given: ['Nick'] },
    ]);
  });

  it('drops the name text once the name changes, since it would be out of date', () => {
    const withText: Patient = {
      resourceType: 'Patient',
      name: [{ text: 'Ilse Varga', family: 'Varga', given: ['Ilse'] }],
    };

    expect(formToPatient(patientToForm(withText), withText).name?.[0].text).toBe('Ilse Varga');
    expect(
      formToPatient({ ...patientToForm(withText), family: 'Varga-Nagy' }, withText).name?.[0],
    ).toEqual({ use: 'official', family: 'Varga-Nagy', given: ['Ilse'] });
  });

  it('replaces only the first phone and keeps the work phone', () => {
    const patient = formToPatient(form({ phone: '+30 690 000 0000' }), stored);

    expect(patient.telecom).toEqual([
      { system: 'phone', value: '+30 690 000 0000', use: 'mobile' },
      { system: 'phone', value: '+30 210 999 9999', use: 'work' },
    ]);
  });

  it('adds an email next to the existing phones', () => {
    const patient = formToPatient(form({ email: ' nikos@example.org ' }), stored);

    expect(patient.telecom?.at(-1)).toEqual({ system: 'email', value: 'nikos@example.org' });
    expect(patient.telecom).toHaveLength(3);
  });

  it('removes only the cleared entry', () => {
    const patient = formToPatient(
      form({ phone: '', identifiers: { mrn: '', dicomPatientId: '' } }),
      stored,
    );

    expect(patient.telecom).toEqual([{ system: 'phone', value: '+30 210 999 9999', use: 'work' }]);
    expect(patient.identifier).toEqual([{ system: 'urn:other:hospital', value: 'X-77' }]);
  });

  it('never sends empty arrays, which FHIR does not allow', () => {
    const patient = formToPatient({
      given: '',
      family: '',
      gender: '',
      birthDate: '',
      phone: '',
      email: '',
      identifiers: { mrn: '', dicomPatientId: '' },
    });

    expect(patient.name).toBeUndefined();
    expect(patient.telecom).toBeUndefined();
    expect(patient.identifier).toBeUndefined();
  });

  it('builds a new active patient', () => {
    const patient = formToPatient({
      given: 'Ilse',
      family: 'Varga',
      gender: 'female',
      birthDate: '1990-07-28',
      phone: '',
      email: 'ilse@example.org',
      identifiers: { mrn: 'SEED-0003', dicomPatientId: '' },
    });

    expect(JSON.parse(JSON.stringify(patient))).toEqual({
      resourceType: 'Patient',
      active: true,
      name: [{ use: 'official', family: 'Varga', given: ['Ilse'] }],
      gender: 'female',
      birthDate: '1990-07-28',
      telecom: [{ system: 'email', value: 'ilse@example.org' }],
      identifier: [{ system: MRN_SYSTEM, value: 'SEED-0003' }],
    });
  });
});

describe('patientDisplayName', () => {
  it('shows the preferred name', () => {
    expect(patientDisplayName(stored)).toBe('Nikos Petros Andreou');
  });

  it('falls back to the MRN, then the DICOM Patient ID, then the reference', () => {
    const dicomId = dicomPatientIdentifier('LIDC-IDRI-0580');
    const mrn = { system: MRN_SYSTEM, value: 'MRN-7' };
    const unnamed = (...identifier: Identifier[]): Patient => ({
      resourceType: 'Patient',
      id: 'p9',
      identifier,
    });

    expect(patientDisplayName(unnamed(dicomId, mrn))).toBe('MRN-7');
    expect(patientDisplayName(unnamed(dicomId))).toBe('LIDC-IDRI-0580');
    expect(patientDisplayName(unnamed())).toBe('Patient/p9');
  });
});

describe('dicomPatientIdentifier', () => {
  it('types the DICOM Patient ID as PI under its own system, not as an MRN', () => {
    const identifier = dicomPatientIdentifier('KiTS-00136');

    expect(identifier.system).toBe(DICOM_PATIENT_ID_SYSTEM);
    expect(identifier.system).not.toBe(MRN_SYSTEM);
    expect(identifier.value).toBe('KiTS-00136');
    expect(identifier.type?.coding?.[0]).toMatchObject({
      system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
      code: 'PI',
    });
  });
});
