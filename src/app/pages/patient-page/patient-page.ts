import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type { Bundle } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { PatientDetail } from '../../fhir/resources/patient/patient-detail/patient-detail';
import { patientDisplayName } from '../../fhir/resources/patient/patient-mapper';
import { PatientConditions } from './patient-conditions/patient-conditions';

/** Where the delete flow is: closed, looking for linked records, blocked by them, or asking. */
type DeleteStep = 'closed' | 'checking' | 'blocked' | 'confirm' | 'deleting';

/** How many resources of each type point to the patient, from a `_revinclude=*` search. */
function countLinked(bundle: Bundle): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of bundle.entry ?? []) {
    const type = entry.resource?.resourceType;
    if (entry.search?.mode === 'include' && type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => ({ type, count }));
}

@Component({
  imports: [PatientConditions, PatientDetail, RouterLink],
  selector: 'app-patient-page',
  styleUrl: './patient-page.scss',
  templateUrl: './patient-page.html',
})
export class PatientPage {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /patients/:id (router input binding). */
  readonly id = input.required<string>();

  protected readonly patient = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.fhir.read('Patient', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.patient.error()));
  protected readonly name = computed(() =>
    this.patient.hasValue() ? patientDisplayName(this.patient.value()) : '',
  );

  protected readonly deleteStep = signal<DeleteStep>('closed');
  protected readonly linked = signal<{ type: string; count: number }[]>([]);
  protected readonly deleteError = signal('');

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.name()) title.setTitle(`${this.name()} · Artemis`);
    });
  }

  /**
   * Starts the delete flow by finding every resource that points to this patient. HAPI refuses
   * to delete a referenced patient (409), so those block the delete instead of being deleted too.
   */
  protected startDelete(): void {
    this.deleteStep.set('checking');
    this.deleteError.set('');
    this.fhir.searchBundle('Patient', { _id: this.id(), _revinclude: '*' }).subscribe({
      next: (bundle) => {
        this.linked.set(countLinked(bundle));
        this.deleteStep.set(this.linked().length ? 'blocked' : 'confirm');
      },
      error: (err) => {
        this.deleteError.set(fhirErrorMessage(err));
        this.deleteStep.set('confirm');
      },
    });
  }

  protected confirmDelete(): void {
    this.deleteStep.set('deleting');
    this.deleteError.set('');
    this.fhir.delete('Patient', this.id()).subscribe({
      next: () => this.router.navigate(['/patients']),
      error: (err) => {
        // A record linked after the check still makes HAPI refuse (409); its message names it.
        this.deleteError.set(fhirErrorMessage(err));
        this.deleteStep.set('confirm');
      },
    });
  }

  protected cancelDelete(): void {
    this.deleteStep.set('closed');
    this.deleteError.set('');
  }
}
