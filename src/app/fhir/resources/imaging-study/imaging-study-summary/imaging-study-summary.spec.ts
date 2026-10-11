import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ImagingStudy } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { ImagingStudySummary } from './imaging-study-summary';

const dcm = (code: string) => ({ system: CodeSystems.dicom, code });

// seed-study-1
const mri: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-1',
  status: 'available',
  subject: { reference: 'Patient/seed-patient-1' },
  modality: [dcm('MR')],
  started: '2025-02-10', // date only, so the shown day is the same in every time zone
  description: 'MRI breast, bilateral, with contrast',
  numberOfSeries: 2,
  numberOfInstances: 304,
};

describe('ImagingStudySummary', () => {
  let fixture: ComponentFixture<ImagingStudySummary>;
  let element: HTMLElement;

  const render = async (study: ImagingStudy) => {
    fixture.componentRef.setInput('study', study);
    await fixture.whenStable();
  };
  const texts = (selector: string) =>
    [...element.querySelectorAll(selector)].map((e) => e.textContent?.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ImagingStudySummary] }).compileComponents();
    fixture = TestBed.createComponent(ImagingStudySummary);
    element = fixture.nativeElement;
  });

  it('shows name, modality, date and counts', async () => {
    await render(mri);

    expect(texts('.name')).toEqual(['MRI breast, bilateral, with contrast']);
    expect(texts('.modality')).toEqual(['MR']);
    expect(element.querySelector('.modality')?.getAttribute('title')).toBe('Magnetic resonance');
    expect(texts('.details > span')).toEqual(['10 Feb 2025', '2 series', '304 images']);
    expect(element.querySelector('.badge')).toBeNull(); // "available" is the normal case
  });

  it('says "1 image", and leaves out counts it cannot know', async () => {
    await render({ ...mri, numberOfSeries: 1, numberOfInstances: 1 });
    expect(texts('.details > span').slice(1)).toEqual(['1 series', '1 image']);

    await render({
      ...mri,
      started: undefined,
      numberOfSeries: undefined,
      numberOfInstances: undefined,
    });
    expect(texts('.details > span')).toEqual([]);
  });

  it('marks a study that is not available, striking through void ones', async () => {
    await render({ ...mri, status: 'registered' });
    expect(texts('.badge')).toEqual(['Registered']);
    expect(element.querySelector('.name.void')).toBeNull();

    await render({ ...mri, status: 'entered-in-error' });
    expect(texts('.badge.void')).toEqual(['Entered in error']);
    expect(element.querySelector('.name.void')).not.toBeNull();
  });
});
