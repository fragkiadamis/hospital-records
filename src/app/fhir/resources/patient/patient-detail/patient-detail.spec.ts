import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Patient } from 'fhir/r4';
import { MRN_SYSTEM } from '../patient-mapper';
import { PatientDetail } from './patient-detail';

describe('PatientDetail', () => {
  let fixture: ComponentFixture<PatientDetail>;
  let element: HTMLElement;

  const render = async (patient: Patient) => {
    fixture.componentRef.setInput('patient', patient);
    await fixture.whenStable();
  };
  const texts = (selector: string) =>
    [...element.querySelectorAll(selector)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const section = (title: string) =>
    [...element.querySelectorAll('section')].find(
      (s) => s.querySelector('h3')?.textContent === title,
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PatientDetail] }).compileComponents();
    fixture = TestBed.createComponent(PatientDetail);
    element = fixture.nativeElement;
  });

  it('shows the heading and every identifier, contact and address', async () => {
    await render({
      resourceType: 'Patient',
      id: 'seed-patient-2',
      name: [{ use: 'official', family: 'Andreou', given: ['Nikos'] }],
      gender: 'male',
      birthDate: '1955-11-03',
      identifier: [
        { system: MRN_SYSTEM, value: 'SEED-0002' },
        { system: 'urn:other:hospital', value: 'X-77' },
      ],
      telecom: [
        { system: 'phone', value: '+30 210 000 0002', use: 'mobile' },
        { system: 'email', value: 'nikos@example.org' },
      ],
      address: [{ line: ['Ermou 12'], city: 'Athens', use: 'home' }],
    });

    expect(texts('h2')).toEqual(['Nikos Andreou']);
    expect(texts('.sub > span')).toEqual(['Male', 'Born 3 Nov 1955']);
    expect(texts('dt')).toEqual(['MRN', 'urn:other:hospital']);
    expect(texts('dd')).toEqual(['SEED-0002', 'X-77']);
    expect(section('Contact')?.querySelectorAll('li')).toHaveLength(2);
    expect(section('Contact')?.querySelector('.ti-phone')).not.toBeNull();
    expect(texts('section:has(.ti-map-pin) li > span')).toEqual(['Ermou 12, Athens', 'home']);
  });

  it('hides sections the record has no data for', async () => {
    await render({ resourceType: 'Patient', id: 'p9' });

    expect(texts('h2')).toEqual(['Patient/p9']);
    expect(element.querySelectorAll('section')).toHaveLength(0);
    expect(element.querySelector('.badge')).toBeNull();
  });

  it('lists all names only when there is more than one', async () => {
    await render({
      resourceType: 'Patient',
      name: [
        { use: 'official', family: 'Varga', given: ['Ilse'] },
        { use: 'maiden', family: 'Nagy', given: ['Ilse'] },
      ],
    });

    expect(texts('section:last-child li > span')).toEqual([
      'Ilse Varga',
      'official',
      'Ilse Nagy',
      'maiden',
    ]);
  });

  it('marks deceased patients and inactive records', async () => {
    await render({
      resourceType: 'Patient',
      active: false,
      deceasedDateTime: '2024-03-03',
    });

    expect(texts('.deceased')).toEqual(['Deceased 3 Mar 2024']);
    expect(texts('.badge')).toEqual(['Inactive record']);
  });
});
