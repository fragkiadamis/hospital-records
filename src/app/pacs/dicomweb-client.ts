import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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
