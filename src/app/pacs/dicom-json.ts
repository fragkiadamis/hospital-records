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
} as const;
