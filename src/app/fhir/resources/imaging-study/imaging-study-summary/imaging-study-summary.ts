import { Component, computed, input } from '@angular/core';
import type { ImagingStudy } from 'fhir/r4';
import { Icon } from '../../../../shared/icon/icon';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import {
  imagingStudyDisplayName,
  instanceCount,
  isVoidStudy,
  modalityName,
  seriesCount,
  STUDY_STATUSES,
  studyModalities,
} from '../imaging-study-mapper';

/**
 * One-line imaging study: name, modalities, date, series and image counts, and the status when it
 * isn't the usual "available". Display only; wrap it in a link where it should be clickable.
 */
@Component({
  imports: [FhirDatePipe, Icon],
  selector: 'app-imaging-study-summary',
  styleUrl: './imaging-study-summary.scss',
  templateUrl: './imaging-study-summary.html',
})
export class ImagingStudySummary {
  readonly study = input.required<ImagingStudy>();

  protected readonly name = computed(() => imagingStudyDisplayName(this.study()));
  protected readonly voided = computed(() => isVoidStudy(this.study()));
  protected readonly series = computed(() => seriesCount(this.study()));
  protected readonly images = computed(() => instanceCount(this.study()));

  protected readonly modalities = computed(() =>
    studyModalities(this.study()).map((coding) => ({
      code: coding.code,
      name: modalityName(coding),
    })),
  );

  /** Shown only when it is not the usual "available". */
  protected readonly status = computed(() => {
    const status = this.study().status;
    return status && status !== 'available' ? STUDY_STATUSES[status] : '';
  });
}
