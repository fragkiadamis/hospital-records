import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { ImagingStudy } from 'fhir/r4';
import { StudyPage } from './study-page';

const ctChest: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-2',
  status: 'available',
  subject: { reference: 'Patient/seed-patient-2', display: 'Nikos Andreou' },
  description: 'CT chest without contrast',
};

describe('StudyPage', () => {
  let fixture: ComponentFixture<StudyPage>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Opens /patients/:patientId/studies/seed-study-2 and answers the read. */
  const open = async (patientId: string, body: object, status = 200) => {
    fixture.componentRef.setInput('id', patientId);
    fixture.componentRef.setInput('studyId', 'seed-study-2');
    TestBed.tick();
    http.expectOne('/fhir/ImagingStudy/seed-study-2').flush(body, { status, statusText: 'OK' });
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudyPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StudyPage);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('shows the study, with a link back to its patient and its name as the title', async () => {
    await open('seed-patient-2', ctChest);

    expect(element.querySelector('app-imaging-study-detail h2')?.textContent).toBe(
      'CT chest without contrast',
    );
    expect(element.querySelector('a.back')?.getAttribute('href')).toBe('/patients/seed-patient-2');
    expect(TestBed.inject(Title).getTitle()).toBe('CT chest without contrast · Hospital Records');
  });

  it('refuses to show a study under a patient it does not belong to', async () => {
    await open('seed-patient-1', ctChest);

    expect(element.querySelector('app-imaging-study-detail')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'This imaging study does not belong to this patient.',
    );
  });

  it('says when the study does not exist', async () => {
    await open('seed-patient-2', {}, 404);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The resource was not found (HTTP 404)',
    );
  });
});
