import { Component, inject, input } from '@angular/core';
import { Theme } from '../theme/theme';

@Component({
  imports: [],
  selector: 'app-header',
  styleUrl: './header.scss',
  templateUrl: './header.html',
})
export class Header {
  readonly title = input.required<string>();
  readonly userName = input.required<string>();
  readonly hasUnreadNotifications = input(false);

  protected readonly theme = inject(Theme);
}
