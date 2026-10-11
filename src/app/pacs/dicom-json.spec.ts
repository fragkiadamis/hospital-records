import { dicomNumber, DicomDataset, dicomText, dicomValues } from './dicom-json';

const dataset: DicomDataset = {
  '00100020': { vr: 'LO', Value: ['  KiTS-00136 '] },
  '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Kostaki^Daphne' }] },
  '00080061': { vr: 'CS', Value: ['PT', 'CT'] },
  '00201206': { vr: 'IS', Value: [2] },
  '00201208': { vr: 'IS', Value: ['304'] },
  '00080050': { vr: 'SH' }, // present, but empty
};

describe('DICOM JSON values', () => {
  it('reads every value of a tag, or none', () => {
    expect(dicomValues(dataset, '00080061')).toEqual(['PT', 'CT']);
    expect(dicomValues(dataset, '00080050')).toEqual([]);
    expect(dicomValues(dataset, '99999999')).toEqual([]);
  });

  it('reads the first value as trimmed text, and person names in their Alphabetic form', () => {
    expect(dicomText(dataset, '00100020')).toBe('KiTS-00136');
    expect(dicomText(dataset, '00100010')).toBe('Kostaki^Daphne');
    expect(dicomText(dataset, '00080050')).toBe('');
    expect(dicomText(dataset, '99999999')).toBe('');
  });

  it('reads numbers given as numbers or strings, and nothing else', () => {
    expect(dicomNumber(dataset, '00201206')).toBe(2);
    expect(dicomNumber(dataset, '00201208')).toBe(304);
    expect(dicomNumber(dataset, '00100020')).toBeUndefined();
    expect(dicomNumber(dataset, '00080050')).toBeUndefined();
  });
});
