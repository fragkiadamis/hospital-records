import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DicomDataset, Tag } from './dicom-json';
import { DicomwebClient, dicomwebErrorMessage } from './dicomweb-client';

const study = (uid: string): DicomDataset => ({
  [Tag.StudyInstanceUID]: { vr: 'UI', Value: [uid] },
});

describe('DicomwebClient', () => {
  let client: DicomwebClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(DicomwebClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify()); // fails if a test left a request unanswered

  it('searches one page of studies as DICOM JSON, asking for the extra fields', async () => {
    const result = firstValueFrom(client.searchStudies(200, 50));

    const req = http.expectOne((r) => r.url === '/dicom-web/studies');
    expect(req.request.headers.get('Accept')).toBe('application/dicom+json');
    expect(req.request.params.get('offset')).toBe('200');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.getAll('includefield')).toEqual(
      expect.arrayContaining([Tag.StudyDescription, Tag.PatientSex, Tag.TimezoneOffsetFromUTC]),
    );
    req.flush([study('1.2.3')]);

    expect(await result).toEqual([study('1.2.3')]);
  });

  it('reads every page of studies until a short one', async () => {
    const result = firstValueFrom(client.allStudies(2));

    const page = (offset: number) =>
      http.expectOne(
        (r) => r.url === '/dicom-web/studies' && r.params.get('offset') === String(offset),
      );
    page(0).flush([study('1'), study('2')]);
    page(2).flush([study('3'), study('4')]);
    page(4).flush([study('5')]);

    expect((await result).map((s) => s[Tag.StudyInstanceUID]?.Value?.[0])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });

  it('asks once more after a full last page, and stops at the empty one', async () => {
    const result = firstValueFrom(client.allStudies(2));

    const page = (offset: number) =>
      http.expectOne(
        (r) => r.url === '/dicom-web/studies' && r.params.get('offset') === String(offset),
      );
    page(0).flush([study('1'), study('2')]);
    page(2).flush([]);

    expect(await result).toHaveLength(2);
  });

  it('treats 204 No Content as no matches', async () => {
    const result = firstValueFrom(client.searchStudies());

    http
      .expectOne((r) => r.url === '/dicom-web/studies')
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(await result).toEqual([]);
  });

  it("searches a study's series by its Study Instance UID", async () => {
    const result = firstValueFrom(client.searchSeries('1.2.840.1'));

    const req = http.expectOne((r) => r.url === '/dicom-web/studies/1.2.840.1/series');
    expect(req.request.params.getAll('includefield')).toEqual(
      expect.arrayContaining([Tag.SeriesDescription, Tag.BodyPartExamined]),
    );
    req.flush([{ [Tag.SeriesInstanceUID]: { vr: 'UI', Value: ['1.2.840.1.1'] } }]);

    expect(await result).toHaveLength(1);
  });

  it('passes PACS errors on to the caller', async () => {
    const result = firstValueFrom(client.searchSeries('1.2'));

    http
      .expectOne((r) => r.url === '/dicom-web/studies/1.2/series')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({ status: 401 });
  });
});

describe('dicomwebErrorMessage', () => {
  const error = (status: number) => new HttpErrorResponse({ status });

  it('says when the PACS is down, also behind the proxy', () => {
    for (const status of [0, 502, 504]) {
      expect(dicomwebErrorMessage(error(status))).toBe(
        'Cannot reach the PACS. Is the compose stack running?',
      );
    }
  });

  it('points at the Orthanc login when it is refused', () => {
    expect(dicomwebErrorMessage(error(401))).toContain('ORTHANC_PASSWORD');
  });

  it('gives the status otherwise', () => {
    expect(dicomwebErrorMessage(error(500))).toBe('The PACS answered HTTP 500');
  });
});
