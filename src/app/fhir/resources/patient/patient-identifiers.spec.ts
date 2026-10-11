import {
  ANY_IDENTIFIER_SEARCH_PARAM,
  PATIENT_IDENTIFIER_LABELS,
  PATIENT_IDENTIFIER_TYPES,
  patientIdentifierType,
} from './patient-identifiers';
import { DICOM_PATIENT_ID_SYSTEM, MRN_SYSTEM } from './patient-mapper';

describe('patient identifier types', () => {
  it('lists the MRN, then the DICOM Patient ID', () => {
    expect(PATIENT_IDENTIFIER_TYPES.map((t) => t.key)).toEqual(['mrn', 'dicomPatientId']);
    expect(patientIdentifierType('mrn').system).toBe(MRN_SYSTEM);
    expect(patientIdentifierType('dicomPatientId').system).toBe(DICOM_PATIENT_ID_SYSTEM);
  });

  it('labels each by its system', () => {
    expect(PATIENT_IDENTIFIER_LABELS).toEqual({
      [MRN_SYSTEM]: 'MRN',
      [DICOM_PATIENT_ID_SYSTEM]: 'DICOM Patient ID',
    });
  });

  it('gives each its own search parameter, apart from the one on any identifier', () => {
    const params = PATIENT_IDENTIFIER_TYPES.map((t) => t.searchParam);
    expect(new Set([...params, ANY_IDENTIFIER_SEARCH_PARAM]).size).toBe(params.length + 1);
  });

  it('refuses an unknown key', () => {
    expect(() => patientIdentifierType('passport')).toThrow('Unknown patient identifier type');
  });
});
