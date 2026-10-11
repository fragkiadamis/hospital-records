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

  it('finds one study by its Study Instance UID, or nothing', async () => {
    const found = firstValueFrom(client.findStudy('1.2.3'));
    const req = http.expectOne((r) => r.url === '/dicom-web/studies');
    expect(req.request.params.get('StudyInstanceUID')).toBe('1.2.3');
    expect(req.request.params.get('limit')).toBe('1');
    // The same fields as the study list, since the FHIR mapping reads them.
    expect(req.request.params.getAll('includefield')).toEqual(
      expect.arrayContaining([Tag.StudyDescription, Tag.PatientSex, Tag.TimezoneOffsetFromUTC]),
    );
    req.flush([study('1.2.3')]);
    expect(await found).toEqual(study('1.2.3'));

    const missing = firstValueFrom(client.findStudy('9.9'));
    http
      .expectOne((r) => r.url === '/dicom-web/studies')
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await missing).toBeUndefined();
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

  describe('store (STOW-RS)', () => {
    const referenced = (study: string, instance: string) => ({
      [Tag.ReferencedSOPInstanceUID]: { vr: 'UI', Value: [instance] },
      [Tag.RetrieveURL]: {
        vr: 'UR',
        Value: [`http://pacs/dicom-web/studies/${study}/series/9/instances/${instance}`],
      },
    });

    it('posts the files as multipart/related DICOM parts, unchanged', async () => {
      const files = [new Blob(['first']), new Blob(['second'])];
      const result = firstValueFrom(client.store(files));

      const req = http.expectOne('/dicom-web/studies');
      expect(req.request.method).toBe('POST');
      const contentType = req.request.headers.get('Content-Type')!;
      expect(contentType).toMatch(/^multipart\/related; type="application\/dicom"; boundary=/);
      const boundary = contentType.split('boundary=')[1];
      expect(await (req.request.body as Blob).text()).toBe(
        `--${boundary}\r\nContent-Type: application/dicom\r\n\r\nfirst\r\n` +
          `--${boundary}\r\nContent-Type: application/dicom\r\n\r\nsecond\r\n` +
          `--${boundary}--\r\n`,
      );
      req.flush({
        [Tag.ReferencedSOPSequence]: {
          vr: 'SQ',
          Value: [referenced('1.2', '1.2.1'), referenced('1.2', '1.2.2')],
        },
      });

      expect(await result).toEqual({
        stored: [
          { sopInstanceUid: '1.2.1', studyInstanceUid: '1.2' },
          { sopInstanceUid: '1.2.2', studyInstanceUid: '1.2' },
        ],
        failed: [],
      });
    });

    it('reports what a partly refused request stored and refused, instead of failing', async () => {
      const result = firstValueFrom(client.store([new Blob(['a']), new Blob(['b'])]));

      http.expectOne('/dicom-web/studies').flush(
        {
          [Tag.ReferencedSOPSequence]: { vr: 'SQ', Value: [referenced('1.2', '1.2.1')] },
          [Tag.FailedSOPSequence]: {
            vr: 'SQ',
            Value: [
              {
                [Tag.ReferencedSOPInstanceUID]: { vr: 'UI', Value: ['1.2.2'] },
                [Tag.FailureReason]: { vr: 'US', Value: [0xc000] },
              },
            ],
          },
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(await result).toEqual({
        stored: [{ sopInstanceUid: '1.2.1', studyInstanceUid: '1.2' }],
        failed: [{ sopInstanceUid: '1.2.2', reason: 'The PACS could not understand it' }],
      });
    });

    it('passes on errors that are not STOW-RS answers', async () => {
      const result = firstValueFrom(client.store([new Blob(['a'])]));

      http
        .expectOne('/dicom-web/studies')
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await expect(result).rejects.toMatchObject({ status: 401 });
    });
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
