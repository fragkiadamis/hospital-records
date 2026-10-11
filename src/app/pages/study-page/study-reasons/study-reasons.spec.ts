import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Bundle, Condition, ImagingStudy, OperationOutcome } from 'fhir/r4';
import { CodeSystems } from '../../../fhir/code-systems';
import { StudyReasons } from './study-reasons';

const subject = { reference: 'Patient/seed-patient-2' };
const ct: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-2',
  meta: { versionId: '1' },
  status: 'available',
  subject,
  description: 'CT chest without contrast',
  reasonReference: [{ reference: 'Condition/seed-condition-3' }],
};
const condition = (id: string, text: string, status: string, evidence = false): Condition => ({
  resourceType: 'Condition',
  id,
  meta: { versionId: '1' },
  subject,
  code: { text },
  clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: status }] },
  evidence: evidence ? [{ detail: [{ reference: 'ImagingStudy/seed-study-2' }] }] : undefined,
});
const pneumonia = condition('seed-condition-3', 'Pneumonia', 'resolved', true);
const diabetes = condition('seed-condition-4', 'Type 2 diabetes', 'active');

describe('StudyReasons', () => {
  let fixture: ComponentFixture<StudyReasons>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let changed: number;

  /** Opens the panel and answers its Condition search. */
  const open = async () => {
    fixture.componentRef.setInput('open', true);
    TestBed.tick(); // starts the search; waiting for stability first would wait for its answer
    const req = http.expectOne((r) => r.url === '/fhir/Condition');
    expect(req.request.params.get('subject')).toBe('Patient/seed-patient-2');
    req.flush({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [pneumonia, diabetes].map((resource) => ({ resource })),
    } satisfies Bundle<Condition>);
    await fixture.whenStable();
  };

  const checkbox = (name: string) =>
    [...element.querySelectorAll('label')]
      .find((l) => l.querySelector('.name')?.textContent === name)!
      .querySelector('input')!;
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudyReasons],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StudyReasons);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('study', ct);
    fixture.componentRef.setInput('patientId', 'seed-patient-2');
    changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('shows nothing and loads nothing until opened', () => {
    expect(element.textContent?.trim()).toBe('');
  });

  it("lists the patient's conditions with the current reasons checked", async () => {
    await open();

    expect(checkbox('Pneumonia').checked).toBe(true);
    expect(checkbox('Type 2 diabetes').checked).toBe(false);
  });

  it('saves both sides of the link in one transaction', async () => {
    await open();
    checkbox('Type 2 diabetes').click();
    button('Save reasons').click();

    const req = http.expectOne('/fhir');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.type).toBe('transaction');
    expect(req.request.body.entry.map((e: { request: { url: string } }) => e.request.url)).toEqual([
      'ImagingStudy/seed-study-2',
      'Condition/seed-condition-4',
    ]);
    req.flush({ resourceType: 'Bundle', type: 'transaction-response' });
    await fixture.whenStable();

    expect(changed).toBe(1);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('just closes when nothing changed', async () => {
    await open();
    button('Save reasons').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(changed).toBe(0);
  });

  it('explains a version conflict and reloads on request', async () => {
    await open();
    checkbox('Pneumonia').click();
    button('Save reasons').click();
    http.expectOne('/fhir').flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'conflict', diagnostics: 'HAPI-0989: not current' }],
      } satisfies OperationOutcome,
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'changed by someone else, so nothing was saved',
    );

    button('Load latest versions').click();
    TestBed.tick();
    http
      .expectOne((r) => r.url === '/fhir/Condition')
      .flush({ resourceType: 'Bundle', type: 'searchset' });
    await fixture.whenStable();
    expect(changed).toBe(1); // the page reloads the study
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
