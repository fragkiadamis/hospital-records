import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FhirClient } from '../../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../../fhir/client/fhir-error';
import { byStudyOrder } from '../../../fhir/resources/imaging-study/imaging-study-mapper';
import { ImagingStudySummary } from '../../../fhir/resources/imaging-study/imaging-study-summary/imaging-study-summary';
import { Icon } from '../../../shared/icon/icon';

/** More than any patient is expected to have; paging comes if that turns out wrong. */
const MAX_STUDIES = 200;

/** The "Imaging studies" card of the patient page: every ImagingStudy of the patient. */
@Component({
  imports: [Icon, ImagingStudySummary, RouterLink],
  selector: 'app-patient-studies',
  styles: ':host { display: block; }',
  templateUrl: './patient-studies.html',
})
export class PatientStudies {
  private readonly fhir = inject(FhirClient);

  readonly patientId = input.required<string>();

  protected readonly studies = rxResource({
    params: () => this.patientId(),
    stream: ({ params: id }) =>
      this.fhir.search('ImagingStudy', { subject: `Patient/${id}`, _count: MAX_STUDIES }),
  });

  /** Newest first; cancelled or entered-in-error studies last. */
  protected readonly sorted = computed(() =>
    this.studies.hasValue() ? [...this.studies.value()].sort(byStudyOrder) : [],
  );

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.studies.error()));
}
