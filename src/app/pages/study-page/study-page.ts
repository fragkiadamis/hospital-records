import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { ImagingStudyDetail } from '../../fhir/resources/imaging-study/imaging-study-detail/imaging-study-detail';
import {
  imagingStudyDisplayName,
  isStudyOf,
} from '../../fhir/resources/imaging-study/imaging-study-mapper';
import { Icon } from '../../shared/icon/icon';
import { StudyReasons } from './study-reasons/study-reasons';

@Component({
  imports: [Icon, ImagingStudyDetail, RouterLink, StudyReasons],
  selector: 'app-study-page',
  templateUrl: './study-page.html',
})
export class StudyPage {
  private readonly fhir = inject(FhirClient);

  /** From the route, /patients/:id/studies/:studyId (router input binding). */
  readonly id = input.required<string>();
  readonly studyId = input.required<string>();

  protected readonly study = rxResource({
    params: () => this.studyId(),
    stream: ({ params: id }) => this.fhir.read('ImagingStudy', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.study.error()));

  /** Whether the reasons panel is open; it is two-way bound to the panel's `open`. */
  protected readonly editingReasons = signal(false);

  /** False when the URL pairs the study with a patient it doesn't belong to. */
  protected readonly belongsToPatient = computed(
    () => this.study.hasValue() && isStudyOf(this.study.value(), this.id()),
  );

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.belongsToPatient() && this.study.hasValue()) {
        title.setTitle(`${imagingStudyDisplayName(this.study.value())} · Hospital Records`);
      }
    });
  }
}
