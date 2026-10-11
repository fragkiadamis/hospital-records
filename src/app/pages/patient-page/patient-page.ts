import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { PatientDetail } from '../../fhir/resources/patient/patient-detail/patient-detail';
import { patientDisplayName } from '../../fhir/resources/patient/patient-mapper';

@Component({
  imports: [PatientDetail, RouterLink],
  selector: 'app-patient-page',
  styleUrl: './patient-page.scss',
  templateUrl: './patient-page.html',
})
export class PatientPage {
  private readonly fhir = inject(FhirClient);

  /** From the route, /patients/:id (router input binding). */
  readonly id = input.required<string>();

  protected readonly patient = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.fhir.read('Patient', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.patient.error()));

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.patient.hasValue()) {
        title.setTitle(`${patientDisplayName(this.patient.value())} · Artemis`);
      }
    });
  }
}
