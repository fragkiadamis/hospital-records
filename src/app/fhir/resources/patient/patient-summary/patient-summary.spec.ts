import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Patient } from 'fhir/r4';
import { MRN_SYSTEM } from '../patient-mapper';
import { PatientSummary } from './patient-summary';

describe('PatientSummary', () => {
  let fixture: ComponentFixture<PatientSummary>;
  let element: HTMLElement;

  const render = async (patient: Patient) => {
    fixture.componentRef.setInput('patient', patient);
    await fixture.whenStable();
  };
  const text = (selector: string) =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PatientSummary] }).compileComponents();
    fixture = TestBed.createComponent(PatientSummary);
    element = fixture.nativeElement;
  });

  it('shows name, sex, birth date and MRN', async () => {
    await render({
      resourceType: 'Patient',
      id: 'seed-patient-2',
      name: [{ use: 'official', family: 'Andreou', given: ['Nikos', 'Petros'] }],
      gender: 'male',
      birthDate: '1955-11-03',
      identifier: [{ system: MRN_SYSTEM, value: 'SEED-0002' }],
    });

    expect(text('.name')).toBe('Nikos Petros Andreou');
    const details = [...element.querySelectorAll('.details > span')].map((s) => s.textContent);
    expect(details).toEqual(['Male', 'Born 3 Nov 1955']);
    expect(text('.mrn')).toBe('MRN SEED-0002');
  });

  it('leaves out what the patient record does not have', async () => {
    await render({ resourceType: 'Patient', id: 'p9', gender: 'unknown' });

    expect(text('.name')).toBe('Patient/p9');
    expect(element.querySelectorAll('.details > span')).toHaveLength(1);
    expect(element.querySelector('.mrn')).toBeNull();
  });

  it('ignores identifiers from other systems', async () => {
    await render({
      resourceType: 'Patient',
      identifier: [{ system: 'urn:other:hospital', value: 'X-77' }],
    });

    expect(element.querySelector('.mrn')).toBeNull();
  });
});
