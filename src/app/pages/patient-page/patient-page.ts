import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { DeletePanel } from '../../fhir/delete-panel/delete-panel';
import { PatientDetail } from '../../fhir/resources/patient/patient-detail/patient-detail';
import { patientDisplayName } from '../../fhir/resources/patient/patient-mapper';
import { PatientConditions } from './patient-conditions/patient-conditions';
import { PatientStudies } from './patient-studies/patient-studies';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [DeletePanel, Icon, PatientConditions, PatientDetail, PatientStudies, RouterLink],
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

  /** Whether the delete panel is open; it is two-way bound to the panel's `open`. */
  protected readonly deleting = signal(false);

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.name()) title.setTitle(`${this.name()} · Artemis`);
    });
  }

  protected onDeleted(): void {
    this.router.navigate(['/patients']);
  }
}
