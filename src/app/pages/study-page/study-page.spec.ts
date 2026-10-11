import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { Bundle, ImagingStudy } from 'fhir/r4';
import { StudyPage } from './study-page';

const ctChest: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-2',
  status: 'available',
  subject: { reference: 'Patient/seed-patient-2', display: 'Nikos Andreou' },
  identifier: [{ system: 'urn:dicom:uid', value: 'urn:oid:2.25.42' }],
  description: 'CT chest without contrast',
};
const dicomStudy = { '0020000D': { vr: 'UI', Value: ['2.25.42'] } };

describe('StudyPage', () => {
  let fixture: ComponentFixture<StudyPage>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /**
   * Opens /patients/:patientId/studies/seed-study-2 and answers the read, then the page's
   * question whether the PACS has the study (`pacs`: the QIDO-RS answer; omit it when the page
   * shouldn't ask).
   */
  const open = async (
    patientId: string,
    body: object,
    status = 200,
    pacs?: { studies: object[] | null; status?: number },
  ) => {
    fixture.componentRef.setInput('id', patientId);
    fixture.componentRef.setInput('studyId', 'seed-study-2');
    TestBed.tick();
    http.expectOne('/fhir/ImagingStudy/seed-study-2').flush(body, { status, statusText: 'OK' });
    if (pacs) {
      // The read resolves asynchronously; only then does the page know the UID to ask about.
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
      const req = http.expectOne((r) => r.url === '/dicom-web/studies');
      expect(req.request.params.get('StudyInstanceUID')).toBe('2.25.42');
      req.flush(pacs.studies, { status: pacs.status ?? 200, statusText: 'OK' });
    }
    await fixture.whenStable();
  };

  /** Clicks Delete and answers the panel's check for linked records with none. */
  const openDeletePanel = async () => {
    deleteButton()!.click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/fhir/ImagingStudy' && r.params.get('_revinclude') === '*')
      .flush({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);
    await fixture.whenStable();
  };

  const deleteButton = () =>
    [...element.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) =>
      b.textContent?.includes('Delete'),
    );

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
    await open('seed-patient-2', ctChest, 200, { studies: [dicomStudy] });

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

  it('can delete a study the PACS still has, warning that the next sync brings it back', async () => {
    await open('seed-patient-2', ctChest, 200, { studies: [dicomStudy] });
    expect(element.querySelector('[role="status"]')).toBeNull();

    await openDeletePanel();

    expect(element.querySelector('app-delete-panel .note')?.textContent).toContain(
      'still in the PACS, so the next PACS sync will create the imaging study again',
    );
  });

  it('says when the study is no longer in the PACS, and deletes it without a note', async () => {
    await open('seed-patient-2', ctChest, 200, { studies: null, status: 204 }); // no match

    const notice = element.querySelector('[role="status"]')?.textContent;
    expect(notice).toContain('Not available in the PACS.');
    expect(notice).toContain('2.25.42');

    await openDeletePanel();
    expect(element.querySelector('app-delete-panel .note')).toBeNull();
  });

  it('also offers to delete a study without a Study Instance UID, without asking the PACS', async () => {
    await open('seed-patient-2', { ...ctChest, identifier: undefined });

    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'has no Study Instance UID',
    );
    expect(deleteButton()).toBeDefined();
  });

  it('deletes it after checking for linked records, then goes back to the patient', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await open('seed-patient-2', ctChest, 200, { studies: [] });

    await openDeletePanel();

    [...element.querySelectorAll<HTMLButtonElement>('app-delete-panel button')]
      .find((b) => b.textContent?.includes('Delete'))!
      .click();
    const req = http.expectOne('/fhir/ImagingStudy/seed-study-2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/patients', 'seed-patient-2']);
  });

  it('says when the PACS could not be asked, and can still delete, with a hedged note', async () => {
    await open('seed-patient-2', ctChest, 200, { studies: null, status: 504 });

    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'Could not check whether the study is in the PACS: Cannot reach the PACS.',
    );
    await openDeletePanel();
    expect(element.querySelector('app-delete-panel .note')?.textContent).toContain(
      'If its DICOM study is still in the PACS',
    );
  });
});
