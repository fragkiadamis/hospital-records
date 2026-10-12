import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Endpoint } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { EndpointForm } from '../../fhir/resources/endpoint/endpoint-form/endpoint-form';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [EndpointForm, Icon, RouterLink],
  selector: 'app-endpoint-new',
  templateUrl: './endpoint-new.html',
})
export class EndpointNew {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected create(endpoint: Endpoint): void {
    this.saving.set(true);
    this.error.set('');
    this.fhir.create(endpoint).subscribe({
      next: (created) => this.router.navigate(['/endpoints', created.id]),
      error: (err) => {
        this.error.set(fhirErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  protected cancel(): void {
    this.router.navigate(['/endpoints']);
  }
}
