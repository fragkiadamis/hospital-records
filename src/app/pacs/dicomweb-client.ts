import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, Observable, reduce } from 'rxjs';
import { DicomDataset, Tag } from './dicom-json';
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

/**
 * Read-only client for the PACS's DICOMweb search API (QIDO-RS):
 *
 *   searchStudies  GET [base]/studies?limit&offset
 *   allStudies     the same, page after page until a short page
 *   findStudy      GET [base]/studies?StudyInstanceUID=[uid]
 *   searchSeries   GET [base]/studies/[uid]/series
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

  private get(url: string, params: HttpParams): Observable<DicomDataset[]> {
    return this.http
      .get<DicomDataset[] | null>(url, { headers: this.headers, params })
      .pipe(map((datasets) => datasets ?? [])); // 204 No Content: nothing matched
  }
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
