import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { Patient } from 'fhir/r4';
import { PatientPage } from './patient-page';

describe('PatientPage', () => {
  let fixture: ComponentFixture<PatientPage>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Answers the read the page sent for `id`, then lets the page render the result. */
  const respond = async (id: string, body: object, status = 200) => {
    TestBed.tick();
    http.expectOne(`/fhir/Patient/${id}`).flush(body, { status, statusText: 'OK' });
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PatientPage);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('reads the patient from the route id and shows it', async () => {
    fixture.componentRef.setInput('id', 'seed-patient-1');
    await respond('seed-patient-1', {
      resourceType: 'Patient',
      id: 'seed-patient-1',
      name: [{ family: 'Kostaki', given: ['Daphne'] }],
    } satisfies Patient);

    expect(element.querySelector('app-patient-detail h2')?.textContent).toBe('Daphne Kostaki');
    expect(TestBed.inject(Title).getTitle()).toBe('Daphne Kostaki · Artemis');
    expect(element.querySelector('a.back')?.getAttribute('href')).toBe('/patients');
  });

  it('says when the patient does not exist', async () => {
    fixture.componentRef.setInput('id', 'missing');
    await respond('missing', {}, 404);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The resource was not found (HTTP 404)',
    );
  });
});
