/** URIs of the code systems Artemis uses, so they are written (and mistyped) in one place. */
export const CodeSystems = {
  snomed: 'http://snomed.info/sct',
  /** WHO's international ICD-10. National variants (ICD-10-CM, -GM, …) have their own URIs. */
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  /** WHO ICD-11, Mortality and Morbidity Statistics linearization. */
  icd11: 'http://id.who.int/icd/release/11/mms',
  loinc: 'http://loinc.org',
  /** DICOM controlled terminology, e.g. modalities (CT, MR, …). */
  dicom: 'http://dicom.nema.org/resources/ontology/DCM',
  /** Identifier system for DICOM UIDs, e.g. a Study Instance UID as "urn:oid:2.25.…". */
  dicomUid: 'urn:dicom:uid',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionVerification: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  /** HL7 v2 table 0203 identifier types, e.g. ACSN (accession number), MR (medical record). */
  identifierType: 'http://terminology.hl7.org/CodeSystem/v2-0203',
} as const;

/** Short names to show next to a code. Systems not listed here are shown as "Code". */
export const CODE_SYSTEM_LABELS: Readonly<Record<string, string>> = {
  [CodeSystems.snomed]: 'SNOMED',
  [CodeSystems.icd10]: 'ICD-10',
  [CodeSystems.icd11]: 'ICD-11',
  [CodeSystems.loinc]: 'LOINC',
  [CodeSystems.dicom]: 'DICOM',
};
