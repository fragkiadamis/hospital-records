import type { ImagingStudy } from 'fhir/r4';
import { DicomDataset, Tag } from '../../../pacs/dicom-json';
import { CodeSystems } from '../../code-systems';
import { DICOM_PATIENT_ID_SYSTEM, MRN_SYSTEM } from '../patient/patient-mapper';
import {
  fhirDate,
  fhirDateTime,
  humanName,
  imagingStudyFrom,
  patientFromStudy,
  seriesFrom,
  studyUidIdentifier,
} from './dicom-mapper';

/** A DICOM JSON attribute. */
const at = (vr: string, ...Value: unknown[]) => ({ vr, Value });
const dcm = (code: string) => ({ system: CodeSystems.dicom, code });

// A breast MRI as QIDO-RS returns it, with every attribute the mapping reads.
const study: DicomDataset = {
  [Tag.StudyInstanceUID]: at('UI', '2.25.1001'),
  [Tag.StudyDate]: at('DA', '20250210'),
  [Tag.StudyTime]: at('TM', '093000.000'),
  [Tag.AccessionNumber]: at('SH', 'ACC-2025-0042'),
  [Tag.ModalitiesInStudy]: at('CS', 'MR'),
  [Tag.ReferringPhysicianName]: at('PN', { Alphabetic: 'Papadopoulos^Maria' }),
  [Tag.StudyDescription]: at('LO', 'MRI breast, bilateral'),
  [Tag.PatientName]: at('PN', { Alphabetic: 'Kostaki^Daphne' }),
  [Tag.PatientID]: at('LO', 'PACS-0001'),
  [Tag.PatientBirthDate]: at('DA', '19680412'),
  [Tag.PatientSex]: at('CS', 'F'),
  [Tag.NumberOfStudyRelatedSeries]: at('IS', 2),
  [Tag.NumberOfStudyRelatedInstances]: at('IS', 304),
};
const series: DicomDataset[] = [
  {
    [Tag.SeriesInstanceUID]: at('UI', '2.25.1001.2'),
    [Tag.SeriesNumber]: at('IS', 2),
    [Tag.Modality]: at('CS', 'MR'),
    [Tag.SeriesDescription]: at('LO', 'Axial T1 post-contrast'),
    [Tag.NumberOfSeriesRelatedInstances]: at('IS', 160),
    [Tag.BodyPartExamined]: at('CS', 'BREAST'),
  },
  {
    [Tag.SeriesInstanceUID]: at('UI', '2.25.1001.1'),
    [Tag.SeriesNumber]: at('IS', 1),
    [Tag.Modality]: at('CS', 'MR'),
    [Tag.SeriesDescription]: at('LO', 'Axial T1 pre-contrast'),
    [Tag.NumberOfSeriesRelatedInstances]: at('IS', 144),
    [Tag.BodyPartExamined]: at('CS', 'BREAST'),
  },
];
// Like the anonymised sample studies: the name is the id, no birth date, sex O, no time zone.
const anonymised: DicomDataset = {
  [Tag.StudyInstanceUID]: at('UI', '1.3.6.1.4.1.14519.5.2.1.6919.4624'),
  [Tag.StudyDate]: at('DA', '20040912'),
  [Tag.StudyTime]: at('TM', '120000'),
  [Tag.PatientName]: at('PN', { Alphabetic: 'KiTS-00136' }),
  [Tag.PatientID]: at('LO', 'KiTS-00136'),
  [Tag.PatientBirthDate]: { vr: 'DA' },
  [Tag.PatientSex]: at('CS', 'O'),
};
const subject = { reference: 'Patient/p1' };

/** The dataset without one attribute. */
const without = (dataset: DicomDataset, tag: string): DicomDataset =>
  Object.fromEntries(Object.entries(dataset).filter(([key]) => key !== tag));

describe('fhirDate and fhirDateTime', () => {
  it('converts DICOM dates, and ignores malformed ones', () => {
    expect(fhirDate('20250210')).toBe('2025-02-10');
    expect(fhirDate('2025')).toBe('');
    expect(fhirDate('')).toBe('');
  });

  it('keeps a time only when its time zone is known', () => {
    expect(fhirDateTime('20250210', '093000.000', '+0200')).toBe('2025-02-10T09:30:00+02:00');
    expect(fhirDateTime('20250210', '0930', '-0500')).toBe('2025-02-10T09:30:00-05:00');
    expect(fhirDateTime('20250210', '093000', '')).toBe('2025-02-10');
    expect(fhirDateTime('', '093000', '+0200')).toBeUndefined();
  });
});

describe('humanName', () => {
  it('splits DICOM person names into family and given names', () => {
    expect(humanName('Andreou^Nikos^Petros')).toEqual({
      use: 'official',
      family: 'Andreou',
      given: ['Nikos', 'Petros'],
    });
    expect(humanName('KiTS-00136')).toEqual({ use: 'official', family: 'KiTS-00136' });
    expect(humanName('')).toBeUndefined();
  });
});

describe('patientFromStudy', () => {
  it('identifies the patient by DICOM Patient ID, not by MRN', () => {
    const patient = patientFromStudy(study);

    expect(patient.identifier).toHaveLength(1);
    expect(patient.identifier?.[0]).toMatchObject({
      system: DICOM_PATIENT_ID_SYSTEM,
      value: 'PACS-0001',
    });
    expect(patient.identifier?.some((i) => i.system === MRN_SYSTEM)).toBe(false);
  });

  it('copies name, gender and birth date', () => {
    expect(patientFromStudy(study)).toMatchObject({
      resourceType: 'Patient',
      active: true,
      name: [{ use: 'official', family: 'Kostaki', given: ['Daphne'] }],
      gender: 'female',
      birthDate: '1968-04-12',
    });
  });

  it('makes a valid patient from an anonymised study', () => {
    const patient = patientFromStudy(anonymised);

    expect(patient.name).toEqual([{ use: 'official', family: 'KiTS-00136' }]);
    expect(patient.gender).toBe('other');
    expect('birthDate' in patient).toBe(false);
  });

  it('leaves the gender unset when DICOM has none', () => {
    expect('gender' in patientFromStudy(without(anonymised, Tag.PatientSex))).toBe(false);
  });
});

describe('imagingStudyFrom', () => {
  it('maps a QIDO-RS study and its series', () => {
    const result = imagingStudyFrom(study, series, subject);

    expect(result.identifier).toEqual([
      studyUidIdentifier('2.25.1001'),
      {
        type: { coding: [{ system: CodeSystems.identifierType, code: 'ACSN' }] },
        value: 'ACC-2025-0042',
      },
    ]);
    expect(result.status).toBe('available');
    expect(result.subject).toEqual(subject);
    expect(result.modality).toEqual([dcm('MR')]);
    expect(result.started).toBe('2025-02-10'); // no time zone in the study: date only
    expect(result.description).toBe('MRI breast, bilateral');
    expect(result.referrer).toEqual({ display: 'Maria Papadopoulos' });
    expect(result.numberOfSeries).toBe(2);
    expect(result.numberOfInstances).toBe(304);
    expect(result.series?.map((s) => [s.number, s.description, s.numberOfInstances])).toEqual([
      [1, 'Axial T1 pre-contrast', 144],
      [2, 'Axial T1 post-contrast', 160],
    ]);
    expect(result.series?.[0].bodySite).toEqual({ display: 'Breast' });
  });

  it('stores the Study Instance UID as an urn:oid under urn:dicom:uid', () => {
    expect(studyUidIdentifier('2.25.1001')).toEqual({
      system: 'urn:dicom:uid',
      value: 'urn:oid:2.25.1001',
    });
  });

  it('replaces what comes from the PACS and keeps what the app added', () => {
    const existing: ImagingStudy = {
      resourceType: 'ImagingStudy',
      id: 's1',
      meta: { versionId: '3' },
      status: 'available',
      subject: { reference: 'Patient/p1', display: 'Daphne Kostaki' },
      identifier: [studyUidIdentifier('2.25.1001'), { system: 'urn:other:ris', value: 'R-77' }],
      reasonReference: [{ reference: 'Condition/c1' }],
      note: [{ text: 'Reported by Dr. B' }],
      description: 'old description',
      numberOfInstances: 10,
      series: [{ uid: 'gone', modality: dcm('CT') }],
    };

    const result = imagingStudyFrom(study, series, subject, existing);

    expect(result.id).toBe('s1');
    expect(result.meta).toEqual({ versionId: '3' });
    expect(result.subject).toEqual(existing.subject);
    expect(result.reasonReference).toEqual(existing.reasonReference);
    expect(result.note).toEqual(existing.note);
    expect(result.identifier?.at(-1)).toEqual({ system: 'urn:other:ris', value: 'R-77' });
    // From the PACS:
    expect(result.description).toBe('MRI breast, bilateral');
    expect(result.numberOfInstances).toBe(304);
    expect(result.series?.map((s) => s.uid)).toEqual(['2.25.1001.1', '2.25.1001.2']);
  });

  it('drops a field the PACS no longer has instead of keeping the stored value', () => {
    const existing: ImagingStudy = {
      resourceType: 'ImagingStudy',
      status: 'available',
      subject,
      description: 'old description',
    };
    const noDescription = without(study, Tag.StudyDescription);

    expect('description' in imagingStudyFrom(noDescription, series, subject, existing)).toBe(false);
  });

  it('derives modalities and counts from the series when the study lacks them', () => {
    const result = imagingStudyFrom(anonymised, series, subject);

    expect(result.modality).toEqual([dcm('MR')]);
    expect(result.numberOfSeries).toBe(2);
    expect(result.numberOfInstances).toBe(304);
    expect(result.started).toBe('2004-09-12');
    expect('description' in result).toBe(false);
    expect('referrer' in result).toBe(false);
    expect(result.identifier).toEqual([studyUidIdentifier('1.3.6.1.4.1.14519.5.2.1.6919.4624')]);
  });

  it('leaves the instance count out when a series has none, rather than undercounting', () => {
    const uncounted = without(series[0], Tag.NumberOfSeriesRelatedInstances);

    const result = imagingStudyFrom(anonymised, [uncounted, series[1]], subject);

    expect('numberOfInstances' in result).toBe(false);
  });
});

describe('seriesFrom', () => {
  it('keeps the body part as text and defaults a missing modality to OT', () => {
    const result = seriesFrom({
      [Tag.SeriesInstanceUID]: at('UI', '2.25.5'),
      [Tag.BodyPartExamined]: at('CS', 'PORT CHEST'),
    });

    expect(result.bodySite).toEqual({ display: 'Port chest' });
    expect(result.modality).toEqual(dcm('OT'));
  });

  it('keeps the series time when the study gives a time zone', () => {
    const result = seriesFrom(
      {
        [Tag.SeriesInstanceUID]: at('UI', '2.25.6'),
        [Tag.Modality]: at('CS', 'CT'),
        [Tag.SeriesDate]: at('DA', '20250210'),
        [Tag.SeriesTime]: at('TM', '093412'),
      },
      '+0100',
    );

    expect(result.started).toBe('2025-02-10T09:34:12+01:00');
  });
});
