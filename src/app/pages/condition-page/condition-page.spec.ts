import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { Condition } from 'fhir/r4';
import { ConditionPage } from './condition-page';

const pneumonia: Condition = {
  resourceType: 'Condition',
  id: 'seed-condition-3',
  subject: { reference: 'Patient/seed-patient-2', display: 'Nikos Andreou' },
  code: { text: 'Pneumonia' },
};

describe('ConditionPage', () => {
  let fixture: ComponentFixture<ConditionPage>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Opens /patients/:patientId/conditions/:conditionId and answers the read. */
  const open = async (patientId: string, body: object, status = 200) => {
    fixture.componentRef.setInput('id', patientId);
    fixture.componentRef.setInput('conditionId', 'seed-condition-3');
    TestBed.tick();
    http.expectOne('/fhir/Condition/seed-condition-3').flush(body, { status, statusText: 'OK' });
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConditionPage);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it("shows the condition, with a link back to its patient and its name as the tab's title", async () => {
    await open('seed-patient-2', pneumonia);

    expect(element.querySelector('app-condition-detail h2')?.textContent).toBe('Pneumonia');
    expect(element.querySelector('a.back')?.getAttribute('href')).toBe('/patients/seed-patient-2');
    expect(TestBed.inject(Title).getTitle()).toBe('Pneumonia · Hospital Records');
    expect(element.querySelector('a[href$="/edit"]')?.getAttribute('href')).toBe(
      '/patients/seed-patient-2/conditions/seed-condition-3/edit',
    );
  });

  it('refuses to show a condition under a patient it does not belong to', async () => {
    await open('seed-patient-1', pneumonia);

    expect(element.querySelector('app-condition-detail')).toBeNull();
    expect(element.querySelector('a[href$="/edit"]')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'This condition does not belong to this patient.',
    );
  });

  it('says when the condition does not exist', async () => {
    await open('seed-patient-2', {}, 404);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The resource was not found (HTTP 404)',
    );
  });

  it('deletes the condition after confirmation and goes back to the patient', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await open('seed-patient-2', pneumonia);

    const button = (label: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      );
    button('Delete')!.click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/fhir/Condition' && r.params.get('_revinclude') === '*')
      .flush({ resourceType: 'Bundle', type: 'searchset' });
    const studies = http.expectOne((r) => r.url === '/fhir/ImagingStudy');
    expect(studies.request.params.get('subject')).toBe('Patient/seed-patient-2');
    studies.flush({ resourceType: 'Bundle', type: 'searchset' });
    await fixture.whenStable();

    expect(element.querySelector('app-delete-panel')?.textContent).toContain('Delete Pneumonia?');
    button('Delete condition')!.click();
    http.expectOne('/fhir/Condition/seed-condition-3').flush(null);
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/patients', 'seed-patient-2']);
  });
});
