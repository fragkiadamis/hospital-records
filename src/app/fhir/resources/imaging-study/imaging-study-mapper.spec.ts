import type { ImagingStudy, ImagingStudySeries } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import {
  accessionNumber,
  byStartedDesc,
  byStudyOrder,
  imagingStudyDisplayName,
  instanceCount,
  isStudyOf,
  isVoidStudy,
  modalityName,
  seriesCount,
  sortedSeries,
  studyInstanceUid,
  studyModalities,
} from './imaging-study-mapper';

const dcm = (code: string) => ({ system: CodeSystems.dicom, code });
const series = (number: number | undefined, modality: string, instances?: number) =>
  ({
    uid: `2.25.${number ?? 0}`,
    number,
    modality: dcm(modality),
    numberOfInstances: instances,
  }) as ImagingStudySeries;

// Like seed-study-1.
const mri: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-1',
  status: 'available',
  subject: { reference: 'Patient/seed-patient-1' },
  identifier: [
    { system: CodeSystems.dicomUid, value: 'urn:oid:2.25.133047494021215449283204769680095118334' },
    {
      type: { coding: [{ system: CodeSystems.identifierType, code: 'ACSN' }] },
      value: 'ACC-2025-0042',
    },
  ],
  modality: [dcm('MR')],
  started: '2025-02-10T09:30:00+02:00',
  description: 'MRI breast, bilateral, with contrast',
  numberOfSeries: 2,
  numberOfInstances: 304,
  series: [series(2, 'MR', 160), series(1, 'MR', 144)],
};

describe('modalityName', () => {
  it('names known DICOM modalities and falls back to the display or the code', () => {
    expect(modalityName(dcm('MR'))).toBe('Magnetic resonance');
    expect(modalityName({ code: 'XYZ', display: 'Experimental' })).toBe('Experimental');
    expect(modalityName({ code: 'XYZ' })).toBe('XYZ');
  });
});

describe('studyModalities', () => {
  it('combines study and series modalities without duplicates', () => {
    const petCt: ImagingStudy = {
      ...mri,
      modality: [dcm('PT'), dcm('CT')],
      series: [series(1, 'CT'), series(2, 'PT'), series(3, 'SEG')],
    };

    expect(studyModalities(petCt).map((m) => m.code)).toEqual(['PT', 'CT', 'SEG']);
  });
});

describe('identifiers', () => {
  it('reads the Study Instance UID without the urn:oid: prefix', () => {
    expect(studyInstanceUid(mri)).toBe('2.25.133047494021215449283204769680095118334');
    expect(studyInstanceUid({ ...mri, identifier: undefined })).toBe('');
  });

  it('reads the accession number by its ACSN type', () => {
    expect(accessionNumber(mri)).toBe('ACC-2025-0042');
    expect(accessionNumber({ ...mri, identifier: [] })).toBe('');
  });
});

describe('counts', () => {
  it('uses the stored counts', () => {
    expect(seriesCount(mri)).toBe(2);
    expect(instanceCount(mri)).toBe(304);
  });

  it('counts the series when the totals are missing', () => {
    const noTotals = { ...mri, numberOfSeries: undefined, numberOfInstances: undefined };
    expect(seriesCount(noTotals)).toBe(2);
    expect(instanceCount(noTotals)).toBe(304);
  });

  it("doesn't guess an image count when a series has none", () => {
    const partial = {
      ...mri,
      numberOfInstances: undefined,
      series: [series(1, 'MR', 144), series(2, 'MR')],
    };
    expect(instanceCount(partial)).toBeUndefined();
    expect(instanceCount({ ...partial, series: undefined })).toBeUndefined();
  });
});

describe('sortedSeries', () => {
  it('orders by series number, unnumbered last', () => {
    const study = { ...mri, series: [series(undefined, 'SR'), series(2, 'MR'), series(1, 'MR')] };
    expect(sortedSeries(study).map((s) => s.number)).toEqual([1, 2, undefined]);
  });
});

describe('imagingStudyDisplayName', () => {
  it('uses the description, then the procedure, then the modalities, then the reference', () => {
    expect(imagingStudyDisplayName(mri)).toBe('MRI breast, bilateral, with contrast');
    expect(
      imagingStudyDisplayName({
        ...mri,
        description: undefined,
        procedureCode: [{ text: 'Breast MRI' }],
      }),
    ).toBe('Breast MRI');
    expect(imagingStudyDisplayName({ ...mri, description: undefined })).toBe('MR study');
    expect(
      imagingStudyDisplayName({
        resourceType: 'ImagingStudy',
        id: 's9',
        status: 'available',
        subject: mri.subject,
      }),
    ).toBe('ImagingStudy/s9');
  });
});

describe('isStudyOf / byStartedDesc', () => {
  it("checks the study's patient", () => {
    expect(isStudyOf(mri, 'seed-patient-1')).toBe(true);
    expect(isStudyOf(mri, 'seed-patient-2')).toBe(false);
  });

  it('sorts newest first, undated last', () => {
    const studies = [
      { ...mri, id: 'old', started: '2020-01-01' },
      { ...mri, id: 'undated', started: undefined },
      { ...mri, id: 'new', started: '2026-02-20T10:15:00+02:00' },
    ];
    expect(studies.sort(byStartedDesc).map((s) => s.id)).toEqual(['new', 'old', 'undated']);
  });
});

describe('isVoidStudy', () => {
  it('is true for cancelled and entered-in-error studies only', () => {
    expect(isVoidStudy({ ...mri, status: 'cancelled' })).toBe(true);
    expect(isVoidStudy({ ...mri, status: 'entered-in-error' })).toBe(true);
    expect(isVoidStudy(mri)).toBe(false);
    expect(isVoidStudy({ ...mri, status: 'registered' })).toBe(false);
  });
});

describe('byStudyOrder', () => {
  it('puts void studies last, newest first within each group', () => {
    const studies: ImagingStudy[] = [
      { ...mri, id: 'old', started: '2020-01-01' },
      { ...mri, id: 'error', started: '2026-05-01', status: 'entered-in-error' },
      { ...mri, id: 'new', started: '2026-02-20' },
    ];
    expect(studies.sort(byStudyOrder).map((s) => s.id)).toEqual(['new', 'old', 'error']);
  });
});
