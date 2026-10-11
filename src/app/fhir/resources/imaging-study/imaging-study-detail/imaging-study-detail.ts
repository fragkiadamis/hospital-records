import { Component, computed, input } from '@angular/core';
import type { ImagingStudy } from 'fhir/r4';
import { Icon } from '../../../../shared/icon/icon';
import { CodeSystems } from '../../../code-systems';
import { CodeableConceptPipe } from '../../../datatypes/codeable-concept-pipe';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import { identifierLabel } from '../../../datatypes/identifier-pipe';
import { ReferencePipe } from '../../../datatypes/reference-pipe';
import {
  accessionNumber,
  imagingStudyDisplayName,
  instanceCount,
  isVoidStudy,
  modalityName,
  seriesCount,
  sortedSeries,
  STUDY_STATUSES,
  studyInstanceUid,
  studyModalities,
} from '../imaging-study-mapper';

/** Everything on an ImagingStudy record, read-only, including its series. */
@Component({
  imports: [CodeableConceptPipe, FhirDatePipe, Icon, ReferencePipe],
  selector: 'app-imaging-study-detail',
  styleUrl: './imaging-study-detail.scss',
  templateUrl: './imaging-study-detail.html',
})
export class ImagingStudyDetail {
  readonly study = input.required<ImagingStudy>();

  protected readonly name = computed(() => imagingStudyDisplayName(this.study()));
  protected readonly voided = computed(() => isVoidStudy(this.study()));
  protected readonly status = computed(() => STUDY_STATUSES[this.study().status]);
  protected readonly uid = computed(() => studyInstanceUid(this.study()));
  protected readonly accession = computed(() => accessionNumber(this.study()));
  protected readonly seriesTotal = computed(() => seriesCount(this.study()));
  protected readonly images = computed(() => instanceCount(this.study()));
  protected readonly series = computed(() => sortedSeries(this.study()));

  protected readonly modalities = computed(() =>
    studyModalities(this.study())
      .map((coding) => `${modalityName(coding)} (${coding.code})`)
      .join(', '),
  );

  /** Identifiers besides the Study Instance UID and accession number shown above them. */
  protected readonly otherIdentifiers = computed(() =>
    (this.study().identifier ?? [])
      .filter(
        (i) =>
          i.system !== CodeSystems.dicomUid &&
          !i.type?.coding?.some(
            (c) => c.system === CodeSystems.identifierType && c.code === 'ACSN',
          ),
      )
      .map((identifier) => ({ label: identifierLabel(identifier), value: identifier.value ?? '' })),
  );

  protected readonly modalityName = modalityName;
}
