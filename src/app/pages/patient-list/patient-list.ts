import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, forkJoin, map } from 'rxjs';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import {
  ANY_IDENTIFIER_SEARCH_PARAM,
  PATIENT_IDENTIFIER_TYPES,
  patientIdentifierType,
} from '../../fhir/resources/patient/patient-identifiers';
import { PatientSummary } from '../../fhir/resources/patient/patient-summary/patient-summary';
import { PacsSync, PacsSyncReport as SyncReport } from '../../pacs/pacs-sync';
import { Icon } from '../../shared/icon/icon';
import { PacsSyncReport } from './pacs-sync-report/pacs-sync-report';

/** How many patients one search shows. Paging comes later. */
const PAGE_SIZE = 50;

/** What the patient search looks in: 'all', 'name', or the key of a patient identifier type. */
type SearchBy = string;

@Component({
  imports: [Icon, PacsSyncReport, PatientSummary, RouterLink],
  selector: 'app-patient-list',
  styleUrl: './patient-list.scss',
  templateUrl: './patient-list.html',
})
export class PatientList {
  private readonly fhir = inject(FhirClient);
  private readonly pacsSync = inject(PacsSync);

  /** What is typed in the search box. */
  protected readonly query = signal('');

  /** The query once typing pauses, so HAPI is not searched on every keystroke. */
  private readonly searchTerm = toSignal(
    toObservable(this.query).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );

  /** What the search looks in: everything, names only, or one kind of identifier (its key). */
  protected readonly searchBy = signal<SearchBy>('all');

  protected readonly searchOptions: readonly { value: SearchBy; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'name', label: 'Name' },
    ...PATIENT_IDENTIFIER_TYPES.map((t) => ({ value: t.key, label: t.label })),
  ];

  protected readonly placeholder = computed(() => {
    const by = this.searchBy();
    if (by === 'all') return 'Search by name or ID';
    return `Search by ${by === 'name' ? 'name' : patientIdentifierType(by).label}`;
  });

  // Names and identifiers both match anywhere in the value, ignoring case (FHIR's :contains on
  // string search parameters): identifiers through the ones `npm run seed` installs (see
  // patient-identifiers.json). So "0001" finds MRN SEED-0001 and "aki" finds Kostaki.
  protected readonly patients = rxResource({
    params: () => {
      const term = this.searchTerm().trim();
      // Without a term the choice doesn't matter: don't reload the list when it changes.
      return term ? { term, by: this.searchBy() } : { term, by: 'all' };
    },
    stream: ({ params: { term, by } }) => {
      const search = (param?: string) =>
        this.fhir.search('Patient', {
          ...(param && term ? { [`${param}:contains`]: term } : {}),
          _sort: 'family,given',
          _count: PAGE_SIZE,
        });
      if (!term) return search();
      if (by === 'name') return search('name');
      if (by !== 'all') return search(patientIdentifierType(by).searchParam);
      return forkJoin([search('name'), search(ANY_IDENTIFIER_SEARCH_PARAM)]).pipe(
        map(([byName, byIdentifier]) => [
          ...byName,
          ...byIdentifier.filter((p) => !byName.some((n) => n.id === p.id)),
        ]),
      );
    },
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.patients.error()));
  protected readonly pageSize = PAGE_SIZE;

  /** Set while the PACS sync runs: how many DICOM studies it has done of how many. */
  protected readonly syncProgress = signal<{ done: number; total: number } | undefined>(undefined);
  protected readonly syncReport = signal<SyncReport | undefined>(undefined);
  protected readonly syncError = signal('');

  /** Creates the Patients and ImagingStudies of the DICOM studies in the PACS that FHIR lacks. */
  protected async syncWithPacs(): Promise<void> {
    this.syncReport.set(undefined);
    this.syncError.set('');
    this.syncProgress.set({ done: 0, total: 0 });
    try {
      const report = await this.pacsSync.sync((done, total) =>
        this.syncProgress.set({ done, total }),
      );
      this.syncReport.set(report);
      if (report.studies.some((s) => s.outcome === 'created')) this.patients.reload();
    } catch (err) {
      this.syncError.set(fhirErrorMessage(err));
    } finally {
      this.syncProgress.set(undefined);
    }
  }
}
