import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { Condition, Reference } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { ConditionForm } from '../../fhir/resources/condition/condition-form/condition-form';
import { patientDisplayName } from '../../fhir/resources/patient/patient-mapper';

@Component({
  imports: [ConditionForm, RouterLink],
  selector: 'app-condition-new',
  templateUrl: './condition-new.html',
})
export class ConditionNew {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /patients/:id/conditions/new (router input binding). */
  readonly id = input.required<string>();

  /** Loaded for its name, which goes into the new condition's subject and the heading. */
  protected readonly patient = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.fhir.read('Patient', id),
  });

  protected readonly patientName = computed(() =>
    this.patient.hasValue() ? patientDisplayName(this.patient.value()) : '',
  );

  protected readonly subject = computed<Reference>(() => ({
    reference: `Patient/${this.id()}`,
    display: this.patientName() || undefined,
  }));

  protected readonly loadError = computed(() => fhirErrorMessage(this.patient.error()));
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  protected create(condition: Condition): void {
    this.saving.set(true);
    this.saveError.set('');
    this.fhir.create(condition).subscribe({
      next: (created) => this.router.navigate(['/patients', this.id(), 'conditions', created.id]),
      error: (err) => {
        this.saveError.set(fhirErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  protected cancel(): void {
    this.router.navigate(['/patients', this.id()]);
  }
}
