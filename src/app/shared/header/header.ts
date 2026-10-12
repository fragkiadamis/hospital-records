import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Theme } from '../theme/theme';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

/** The app's sections, in the header's order. */
const SECTIONS: readonly { path: string; label: string; icon: IconName }[] = [
  { path: '/patients', label: 'Patients', icon: 'user' },
  { path: '/endpoints', label: 'Endpoints', icon: 'plug-connected' },
];

@Component({
  imports: [Icon, RouterLink, RouterLinkActive],
  selector: 'app-header',
  styleUrl: './header.scss',
  templateUrl: './header.html',
})
export class Header {
  readonly title = input.required<string>();
  readonly userName = input.required<string>();
  readonly hasUnreadNotifications = input(false);

  protected readonly theme = inject(Theme);
  protected readonly sections = SECTIONS;
}
