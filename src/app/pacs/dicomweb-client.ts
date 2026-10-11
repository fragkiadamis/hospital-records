import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, EMPTY, expand, map, Observable, of, reduce, throwError } from 'rxjs';
import { dicomNumber, DicomDataset, dicomText, Tag } from './dicom-json';
import { DICOMWEB_BASE_URL } from './dicomweb-config';

/**
 * Attributes QIDO-RS doesn't have to return unless asked for (PS3.18 Table 6.7.1-2): the ones
 * the app needs beyond the defaults, requested with `includefield`.
 */
const STUDY_FIELDS = [
  Tag.StudyDescription,
  Tag.ReferringPhysicianName,
  Tag.TimezoneOffsetFromUTC,
  Tag.PatientBirthDate,
  Tag.PatientSex,
  Tag.NumberOfStudyRelatedSeries,
  Tag.NumberOfStudyRelatedInstances,
];
const SERIES_FIELDS = [
  Tag.SeriesDescription,
  Tag.BodyPartExamined,
  Tag.SeriesDate,
  Tag.SeriesTime,
  Tag.NumberOfSeriesRelatedInstances,
];

/** How many studies one QIDO-RS request asks for when reading them all. */
export const STUDY_PAGE_SIZE = 100;

/** What the PACS said about the instances of one STOW-RS request. */
export interface StowResponse {
  /** Instances it stored, or already had, with the study each belongs to. */
  stored: { sopInstanceUid: string; studyInstanceUid: string }[];
  /** Instances it refused, with why. */
  failed: { sopInstanceUid: string; reason: string }[];
}

/**
 * Client for the PACS's DICOMweb API: searching it (QIDO-RS) and storing in it (STOW-RS).
 *
 *   searchStudies  GET  [base]/studies?limit&offset
 *   allStudies     the same, page after page until a short page
 *   findStudy      GET  [base]/studies?StudyInstanceUID=[uid]
 *   searchSeries   GET  [base]/studies/[uid]/series
 *   store          POST [base]/studies   (multipart/related, one DICOM file per part)
 */
@Injectable({ providedIn: 'root' })
export class DicomwebClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(DICOMWEB_BASE_URL);

  private readonly headers = new HttpHeaders({ Accept: 'application/dicom+json' });

  /** One page of studies, oldest first as the PACS lists them. */
  searchStudies(offset = 0, limit = STUDY_PAGE_SIZE): Observable<DicomDataset[]> {
    const params = withFields(STUDY_FIELDS).set('offset', offset).set('limit', limit);
    return this.get(`${this.base}/studies`, params);
  }

  /** Every study in the PACS, read a page at a time and emitted once as one list. */
  allStudies(pageSize = STUDY_PAGE_SIZE): Observable<DicomDataset[]> {
    const page = (offset: number) =>
      this.searchStudies(offset, pageSize).pipe(map((studies) => ({ offset, studies })));
    return page(0).pipe(
      // A full page may have more after it; a short one is the last.
      expand(({ offset, studies }) =>
        studies.length < pageSize ? EMPTY : page(offset + pageSize),
      ),
      reduce((all, { studies }) => [...all, ...studies], [] as DicomDataset[]),
    );
  }

  /** The study with this Study Instance UID, or undefined when the PACS doesn't have it. */
  findStudy(studyInstanceUid: string): Observable<DicomDataset | undefined> {
    const params = withFields(STUDY_FIELDS)
      .set('StudyInstanceUID', studyInstanceUid)
      .set('limit', 1);
    return this.get(`${this.base}/studies`, params).pipe(map(([study]) => study));
  }

  /** The series of one study. */
  searchSeries(studyInstanceUid: string): Observable<DicomDataset[]> {
    const uid = encodeURIComponent(studyInstanceUid);
    return this.get(`${this.base}/studies/${uid}/series`, withFields(SERIES_FIELDS));
  }

  /**
   * Stores DICOM files in one STOW-RS request. The files are streamed as they are, not read into
   * memory. A request the PACS partly refused (HTTP 400/409 with a STOW-RS body) still emits
   * what it stored and refused; any other error is passed on.
   */
  store(files: readonly Blob[]): Observable<StowResponse> {
    const boundary = `dicom-${crypto.randomUUID()}`;
    const parts: BlobPart[] = files.flatMap((file) => [
      `--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`,
      file,
      '\r\n',
    ]);
    const body = new Blob([...parts, `--${boundary}--\r\n`]);
    const headers = new HttpHeaders({
      Accept: 'application/dicom+json',
      'Content-Type': `multipart/related; type="application/dicom"; boundary=${boundary}`,
    });
    return this.http.post<DicomDataset | null>(`${this.base}/studies`, body, { headers }).pipe(
      map(stowResponse),
      catchError((err: unknown) => {
        const partial = err instanceof HttpErrorResponse && isStowBody(err.error);
        return partial ? of(stowResponse(err.error as DicomDataset)) : throwError(() => err);
      }),
    );
  }

  private get(url: string, params: HttpParams): Observable<DicomDataset[]> {
    return this.http
      .get<DicomDataset[] | null>(url, { headers: this.headers, params })
      .pipe(map((datasets) => datasets ?? [])); // 204 No Content: nothing matched
  }
}

/** Whether an error body is a STOW-RS response, i.e. says which instances were stored or not. */
function isStowBody(body: unknown): boolean {
  return (
    !!body &&
    typeof body === 'object' &&
    (Tag.ReferencedSOPSequence in body || Tag.FailedSOPSequence in body)
  );
}

/** DICOM Failure Reason codes (PS3.4 Annex GG.4) worth saying in words. */
const FAILURE_REASONS: Readonly<Record<number, string>> = {
  0x0110: 'The PACS failed to process it',
  0x0122: 'The PACS does not store this kind of DICOM object',
  0xa700: 'The PACS is out of resources',
  0xa900: 'The data does not match its SOP class',
  0xc000: 'The PACS could not understand it',
};

function stowResponse(body: DicomDataset | null): StowResponse {
  const items = (tag: string) => (body?.[tag]?.Value ?? []) as DicomDataset[];
  return {
    stored: items(Tag.ReferencedSOPSequence).map((item) => ({
      sopInstanceUid: dicomText(item, Tag.ReferencedSOPInstanceUID),
      // ".../studies/{uid}/series/{uid}/instances/{uid}"
      studyInstanceUid: /\/studies\/([^/]+)/.exec(dicomText(item, Tag.RetrieveURL))?.[1] ?? '',
    })),
    failed: items(Tag.FailedSOPSequence).map((item) => {
      const code = dicomNumber(item, Tag.FailureReason);
      return {
        sopInstanceUid: dicomText(item, Tag.ReferencedSOPInstanceUID),
        reason:
          (code !== undefined && FAILURE_REASONS[code]) ||
          `The PACS refused it${code !== undefined ? ` (reason 0x${code.toString(16)})` : ''}`,
      };
    }),
  };
}

function withFields(tags: readonly string[]): HttpParams {
  return tags.reduce((params, tag) => params.append('includefield', tag), new HttpParams());
}

/**
 * Turns a DICOMweb error into display text. Through the dev proxy (and nginx), a PACS that is
 * down answers 502/504 rather than failing the connection.
 */
export function dicomwebErrorMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return err instanceof Error ? err.message : String(err);
  if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) {
    return 'Cannot reach the PACS. Is the compose stack running?';
  }
  if (err.status === 401 || err.status === 403) {
    return `The PACS refused the login (HTTP ${err.status}). Check ORTHANC_USER and ORTHANC_PASSWORD in .env.`;
  }
  return `The PACS answered HTTP ${err.status}`;
}
