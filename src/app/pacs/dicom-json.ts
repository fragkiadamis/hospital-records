/**
 * DICOM JSON, the format QIDO-RS answers in (DICOM PS3.18 Annex F.2): one object per study or
 * series, keyed by tag ("0020000D"), each attribute with its VR and, when it has one, its values.
 */
export interface DicomAttribute {
  vr: string;
  Value?: unknown[];
}

export type DicomDataset = Record<string, DicomAttribute | undefined>;

/** The DICOM tags the app reads, as QIDO-RS keys. */
export const Tag = {
  StudyDate: '00080020',
  SeriesDate: '00080021',
  StudyTime: '00080030',
  SeriesTime: '00080031',
  AccessionNumber: '00080050',
  Modality: '00080060',
  ModalitiesInStudy: '00080061',
  ReferringPhysicianName: '00080090',
  TimezoneOffsetFromUTC: '00080201',
  StudyDescription: '00081030',
  SeriesDescription: '0008103E',
  PatientName: '00100010',
  PatientID: '00100020',
  PatientBirthDate: '00100030',
  PatientSex: '00100040',
  BodyPartExamined: '00180015',
  StudyInstanceUID: '0020000D',
  SeriesInstanceUID: '0020000E',
  SeriesNumber: '00200011',
  NumberOfStudyRelatedSeries: '00201206',
  NumberOfStudyRelatedInstances: '00201208',
  NumberOfSeriesRelatedInstances: '00201209',
  // STOW-RS responses (PS3.18 Table 10.5.3-1)
  ReferencedSOPInstanceUID: '00081155',
  RetrieveURL: '00081190',
  FailureReason: '00081197',
  FailedSOPSequence: '00081198',
  ReferencedSOPSequence: '00081199',
} as const;

/** All values of a tag (DICOM attributes can be multi-valued); [] when absent. */
export function dicomValues(dataset: DicomDataset, tag: string): unknown[] {
  return dataset[tag]?.Value ?? [];
}

/** The first value of a tag as trimmed text, '' when absent. Person names give their Alphabetic form. */
export function dicomText(dataset: DicomDataset, tag: string): string {
  const value = dicomValues(dataset, tag)[0];
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String((value as { Alphabetic?: string }).Alphabetic ?? '');
  return String(value).trim();
}

/** The first value of a numeric tag (IS, US, …); undefined when absent or not a number. */
export function dicomNumber(dataset: DicomDataset, tag: string): number | undefined {
  const [value] = dicomValues(dataset, tag);
  const n = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n)
    ? n
    : undefined;
}
