import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { Patient } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage, isVersionConflict } from '../../fhir/client/fhir-error';
import { PatientForm } from '../../fhir/resources/patient/patient-form/patient-form';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [Icon, PatientForm, RouterLink],
  selector: 'app-patient-edit',
  templateUrl: './patient-edit.html',
})
export class PatientEdit {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /patients/:id/edit (router input binding). */
  readonly id = input.required<string>();

  protected readonly patient = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.fhir.read('Patient', id),
  });

  protected readonly loadError = computed(() => fhirErrorMessage(this.patient.error()));
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  /** Someone else saved the patient after we loaded it, so our version is out of date. */
  protected readonly conflict = signal(false);

  protected update(patient: Patient): void {
    this.saving.set(true);
    this.saveError.set('');
    this.conflict.set(false);
    // The patient carries the meta.versionId we loaded, which update() sends as If-Match.
    this.fhir.update(patient).subscribe({
      next: () => this.router.navigate(['/patients', this.id()]),
      error: (err) => {
        this.conflict.set(isVersionConflict(err));
        this.saveError.set(fhirErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  /** Loads the latest version, dropping the user's unsaved changes. */
  protected reload(): void {
    this.conflict.set(false);
    this.saveError.set('');
    this.patient.reload();
  }

  protected cancel(): void {
    this.router.navigate(['/patients', this.id()]);
  }
}
