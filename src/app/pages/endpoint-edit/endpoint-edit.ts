import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { Endpoint } from 'fhir/r4';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage, isVersionConflict } from '../../fhir/client/fhir-error';
import { EndpointForm } from '../../fhir/resources/endpoint/endpoint-form/endpoint-form';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [EndpointForm, Icon, RouterLink],
  selector: 'app-endpoint-edit',
  templateUrl: './endpoint-edit.html',
})
export class EndpointEdit {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /endpoints/:id/edit (router input binding). */
  readonly id = input.required<string>();

  protected readonly endpoint = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.fhir.read('Endpoint', id),
  });

  protected readonly loadError = computed(() => fhirErrorMessage(this.endpoint.error()));
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  /** Someone else saved the endpoint after we loaded it, so our version is out of date. */
  protected readonly conflict = signal(false);

  protected update(endpoint: Endpoint): void {
    this.saving.set(true);
    this.saveError.set('');
    this.conflict.set(false);
    // The endpoint carries the meta.versionId we loaded, which update() sends as If-Match.
    this.fhir.update(endpoint).subscribe({
      next: () => this.router.navigate(['/endpoints', this.id()]),
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
    this.endpoint.reload();
  }

  protected cancel(): void {
    this.router.navigate(['/endpoints', this.id()]);
  }
}
