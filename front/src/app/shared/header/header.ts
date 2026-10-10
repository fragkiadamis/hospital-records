import { Component, input } from '@angular/core';

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
}
