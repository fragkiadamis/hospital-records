import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Patient } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { PatientForm } from '../../fhir/resources/patient/patient-form/patient-form';

@Component({
  imports: [PatientForm, RouterLink],
  selector: 'app-patient-new',
  styleUrl: './patient-new.scss',
  templateUrl: './patient-new.html',
})
export class PatientNew {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected create(patient: Patient): void {
    this.saving.set(true);
    this.error.set('');
    this.fhir.create(patient).subscribe({
      next: (created) => this.router.navigate(['/patients', created.id]),
      error: (err) => {
        this.error.set(fhirErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  protected cancel(): void {
    this.router.navigate(['/patients']);
  }
}
