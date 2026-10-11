import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Patient } from 'fhir/r4';
import { MRN_SYSTEM } from '../patient-mapper';
import { PatientForm } from './patient-form';

describe('PatientForm', () => {
  let fixture: ComponentFixture<PatientForm>;
  let element: HTMLElement;
  let saved: Patient[];

  const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
    element.querySelector<T>(`[formControlName="${name}"]`)!;

  /** Types into a field the way a user does: input event, then leaving the field. */
  const type = (name: string, value: string) => {
    const control = field(name);
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
    control.dispatchEvent(new Event('blur'));
  };

  const submit = async () => {
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  const errors = () => [...element.querySelectorAll('.error')].map((e) => e.textContent?.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PatientForm] }).compileComponents();
    fixture = TestBed.createComponent(PatientForm);
    element = fixture.nativeElement;
    saved = [];
    fixture.componentInstance.save.subscribe((patient) => saved.push(patient));
    await fixture.whenStable();
  });

  it('emits the patient built from the filled-in fields', async () => {
    type('given', 'Ilse');
    type('family', 'Varga');
    type('gender', 'female');
    type('birthDate', '1990-07-28');
    type('mrn', 'SEED-0003');
    await submit();

    expect(errors()).toEqual([]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      resourceType: 'Patient',
      active: true,
      name: [{ use: 'official', family: 'Varga', given: ['Ilse'] }],
      gender: 'female',
      birthDate: '1990-07-28',
      identifier: [{ system: MRN_SYSTEM, value: 'SEED-0003' }],
    });
  });

  it('requires a given or a family name', async () => {
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual(['Enter a given or a family name.']);

    type('family', 'Varga');
    await submit();
    expect(saved).toHaveLength(1);
  });

  it('rejects a birth date in the future and an invalid email', async () => {
    type('family', 'Varga');
    type('birthDate', '2999-01-01');
    type('email', 'not-an-email');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual([
      "The birth date can't be in the future.",
      'Enter a valid email address.',
    ]);
  });

  it('fills in a stored patient and keeps its other fields when saving', async () => {
    fixture.componentRef.setInput('patient', {
      resourceType: 'Patient',
      id: 'seed-patient-1',
      meta: { versionId: '2' },
      name: [{ use: 'official', family: 'Kostaki', given: ['Daphne'] }],
      address: [{ city: 'Athens' }],
    } satisfies Patient);
    await fixture.whenStable();

    expect(field('family').value).toBe('Kostaki');

    type('phone', '+30 690 000 0001');
    await submit();

    expect(saved[0]).toMatchObject({
      id: 'seed-patient-1',
      meta: { versionId: '2' },
      address: [{ city: 'Athens' }],
      telecom: [{ system: 'phone', value: '+30 690 000 0001' }],
    });
  });

  it('disables the buttons while saving', async () => {
    fixture.componentRef.setInput('saving', true);
    await fixture.whenStable();

    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(element.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Saving…');
  });
});
