import type { Coding, ImagingStudy, ImagingStudySeries } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { formatCodeableConcept } from '../../datatypes/codeable-concept-pipe';
import { isReferenceTo } from '../../datatypes/reference-pipe';

/**
 * Names of the DICOM modality codes (DICOM PS3.16 CID 29 / CID 33) Hospital Records is likely to see.
 * Codes not listed here are shown as the bare code.
 */
export const MODALITY_NAMES: Readonly<Record<string, string>> = {
  CT: 'Computed tomography',
  MR: 'Magnetic resonance',
  PT: 'Positron emission tomography',
  NM: 'Nuclear medicine',
  US: 'Ultrasound',
  DX: 'Digital radiography',
  CR: 'Computed radiography',
  MG: 'Mammography',
  XA: 'X-ray angiography',
  RF: 'Radiofluoroscopy',
  OCT: 'Optical coherence tomography',
  SEG: 'Segmentation',
  RTSTRUCT: 'Radiotherapy structure set',
  SR: 'Structured report',
  OT: 'Other',
};

/** ImagingStudy.status codes, with the labels the app shows. "available" is the normal case. */
export const STUDY_STATUSES = {
  registered: 'Registered',
  available: 'Available',
  cancelled: 'Cancelled',
  'entered-in-error': 'Entered in error',
  unknown: 'Status unknown',
} as const;

/** The study was cancelled or entered in error: it doesn't hold valid images for the patient. */
export const isVoidStudy = (study: ImagingStudy) =>
  study.status === 'cancelled' || study.status === 'entered-in-error';

/** "Magnetic resonance" for MR; the coding's own display or the bare code otherwise. */
export function modalityName(coding: Coding): string {
  return MODALITY_NAMES[coding.code ?? ''] ?? coding.display ?? coding.code ?? '';
}

/**
 * Every modality in the study, without duplicates: the study-level list first, then any series
 * modality it misses (a PET/CT study lists PT and CT; its series may add SEG).
 */
export function studyModalities(study: ImagingStudy): Coding[] {
  const all = [...(study.modality ?? []), ...(study.series ?? []).map((s) => s.modality)];
  const seen = new Set<string>();
  return all.filter((coding) => {
    const key = coding.code ?? '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The DICOM Study Instance UID ("2.25.…"), from the urn:dicom:uid identifier. */
export function studyInstanceUid(study: ImagingStudy): string {
  const value = study.identifier?.find((i) => i.system === CodeSystems.dicomUid)?.value ?? '';
  return value.replace(/^urn:oid:/, '');
}

/** The accession number: the identifier typed ACSN (HL7 v2 table 0203), as DICOM requires. */
export function accessionNumber(study: ImagingStudy): string {
  return (
    study.identifier?.find((i) =>
      i.type?.coding?.some((c) => c.system === CodeSystems.identifierType && c.code === 'ACSN'),
    )?.value ?? ''
  );
}

/** numberOfSeries, or the series listed when the count is missing. */
export function seriesCount(study: ImagingStudy): number {
  return study.numberOfSeries ?? study.series?.length ?? 0;
}

/**
 * numberOfInstances, or the sum over the series; undefined when that can't be known (a series
 * without a count would make the sum too low).
 */
export function instanceCount(study: ImagingStudy): number | undefined {
  if (study.numberOfInstances !== undefined) return study.numberOfInstances;
  const counts = (study.series ?? []).map((s) => s.numberOfInstances);
  if (!counts.length || counts.some((n) => n === undefined)) return undefined;
  return counts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** Series in acquisition order (by series number; unnumbered ones last, in stored order). */
export function sortedSeries(study: ImagingStudy): ImagingStudySeries[] {
  return [...(study.series ?? [])].sort(
    (a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * "MRI breast, bilateral, with contrast": the description, else the procedure, else
 * "MR study", else the resource reference.
 */
export function imagingStudyDisplayName(study: ImagingStudy): string {
  if (study.description) return study.description;
  const procedure = formatCodeableConcept(study.procedureCode?.[0]);
  if (procedure) return procedure;
  const modalities = studyModalities(study).map((m) => m.code);
  if (modalities.length) return `${modalities.join('/')} study`;
  return `ImagingStudy/${study.id ?? 'new'}`;
}

/** Whether the study's subject is the given patient (see isConditionOf). */
export function isStudyOf(study: ImagingStudy, patientId: string): boolean {
  return isReferenceTo(study.subject, 'Patient', patientId);
}

/** Newest first; studies without a start date last. */
export function byStartedDesc(a: ImagingStudy, b: ImagingStudy): number {
  return (b.started ?? '').localeCompare(a.started ?? '');
}

/** For lists: valid studies newest first, then cancelled / entered-in-error ones. */
export function byStudyOrder(a: ImagingStudy, b: ImagingStudy): number {
  return Number(isVoidStudy(a)) - Number(isVoidStudy(b)) || byStartedDesc(a, b);
}
