import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';
import { map, Observable } from 'rxjs';
import { FHIR_BASE_URL } from './fhir-config';

export type ResourceType = FhirResource['resourceType'];

/** Narrows FhirResource to one type: ResourceOf<'Patient'> is Patient. */
export type ResourceOf<K extends ResourceType> = Extract<FhirResource, { resourceType: K }>;

/** Search parameters, e.g. { subject: 'Patient/123', _sort: '-_lastUpdated' }. Empty values are skipped. */
export type SearchParams = Record<string, string | number | undefined>;

/**
 * Generic client for the FHIR REST API. It knows no resource type; callers pick one.
 *
 *   read         GET    [base]/[type]/[id]
 *   search       GET    [base]/[type]?params
 *   create       POST   [base]/[type]
 *   update       PUT    [base]/[type]/[id]
 *   delete       DELETE [base]/[type]/[id]
 *   transaction  POST   [base]               (Bundle of type "transaction")
 */
@Injectable({ providedIn: 'root' })
export class FhirClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(FHIR_BASE_URL);

  private readonly headers = new HttpHeaders({
    Accept: 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
  });

  read<K extends ResourceType>(type: K, id: string): Observable<ResourceOf<K>> {
    return this.http.get<ResourceOf<K>>(`${this.base}/${type}/${id}`, { headers: this.headers });
  }

  /** The matching resources, unwrapped from the searchset Bundle. */
  search<K extends ResourceType>(type: K, params: SearchParams = {}): Observable<ResourceOf<K>[]> {
    return this.searchBundle(type, params).pipe(
      map((bundle) =>
        (bundle.entry ?? [])
          // A searchset can also hold _include'd resources and OperationOutcomes.
          .filter((e) => e.search?.mode !== 'outcome' && e.resource?.resourceType === type)
          .map((e) => e.resource as ResourceOf<K>),
      ),
    );
  }

  /** The raw searchset Bundle, for totals and paging links. */
  searchBundle<K extends ResourceType>(
    type: K,
    params: SearchParams = {},
  ): Observable<Bundle<ResourceOf<K>>> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') httpParams = httpParams.set(key, String(value));
    }
    return this.http.get<Bundle<ResourceOf<K>>>(`${this.base}/${type}`, {
      // HAPI reuses identical search results for 60 s, which hides just-created resources.
      headers: this.headers.set('Cache-Control', 'no-cache'),
      params: httpParams,
    });
  }

  /** The server assigns id and meta, so they are never sent. */
  create<T extends FhirResource>(resource: T): Observable<T> {
    const body = { ...resource, id: undefined, meta: undefined }; // undefined keys are dropped from the JSON
    return this.http.post<T>(`${this.base}/${resource.resourceType}`, body, {
      headers: this.headers,
    });
  }

  /**
   * PUT replaces the whole resource. With meta.versionId it is sent as If-Match,
   * so the server rejects the update (412) if someone else changed it meanwhile.
   */
  update<T extends FhirResource>(resource: T): Observable<T> {
    if (!resource.id) throw new Error('update() needs a resource with an id');
    const versionId = resource.meta?.versionId;
    const headers = versionId ? this.headers.set('If-Match', `W/"${versionId}"`) : this.headers;
    return this.http.put<T>(`${this.base}/${resource.resourceType}/${resource.id}`, resource, {
      headers,
    });
  }

  delete(type: ResourceType, id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${type}/${id}`, { headers: this.headers });
  }

  /** All entries succeed or none do. */
  transaction(entries: BundleEntry[]): Observable<Bundle> {
    const bundle: Bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
    return this.http.post<Bundle>(this.base, bundle, { headers: this.headers });
  }
}
