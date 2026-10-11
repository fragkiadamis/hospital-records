import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { PatientSummary } from '../../fhir/resources/patient/patient-summary/patient-summary';
import { PacsSync, PacsSyncReport as SyncReport } from '../../pacs/pacs-sync';
import { Icon } from '../../shared/icon/icon';
import { PacsSyncReport } from './pacs-sync-report/pacs-sync-report';

/** How many patients one search shows. Paging comes later. */
const PAGE_SIZE = 50;

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

  protected readonly patients = rxResource({
    params: () => this.searchTerm().trim(),
    stream: ({ params: name }) =>
      this.fhir.search('Patient', {
        name: name || undefined, // HAPI matches the start of any name part, ignoring case
        _sort: 'family,given',
        _count: PAGE_SIZE,
      }),
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
