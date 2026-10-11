import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { PatientSummary } from '../../fhir/resources/patient/patient-summary/patient-summary';
import { Icon } from '../../shared/icon/icon';

/** How many patients one search shows. Paging comes later. */
const PAGE_SIZE = 50;

@Component({
  imports: [Icon, PatientSummary, RouterLink],
  selector: 'app-patient-list',
  styleUrl: './patient-list.scss',
  templateUrl: './patient-list.html',
})
export class PatientList {
  private readonly fhir = inject(FhirClient);

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
}
