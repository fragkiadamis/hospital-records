import { Component, computed, inject, input, ViewEncapsulation } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IconName, ICONS } from './icons';

/**
 * A Tabler icon as inline SVG: `<app-icon name="user" />`. It is 1em square and uses the text
 * colour, so size and colour it like text (font-size, color).
 *
 * Decorative by default (hidden from screen readers, since the text next to it says the same).
 * Give it a `label` when the icon alone carries the meaning, e.g. an icon-only button.
 */
@Component({
  selector: 'app-icon',
  template: '',
  styles: `
    app-icon {
      display: inline-flex;
      flex: none;
      width: 1em;
      height: 1em;
      vertical-align: -0.125em;

      > svg {
        width: 100%;
        height: 100%;
      }
    }
  `,
  // The SVG is inserted as markup, so emulated encapsulation couldn't reach it to size it.
  encapsulation: ViewEncapsulation.None,
  host: {
    '[innerHTML]': 'svg()',
    '[attr.data-icon]': 'name()',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
  },
})
export class Icon {
  readonly name = input.required<IconName>();
  /** What the icon means, for screen readers. Leave out for decorative icons. */
  readonly label = input<string>();

  private readonly sanitizer = inject(DomSanitizer);

  // Angular's sanitizer would strip <svg>. The markup is safe: it comes from the @tabler/icons
  // package at build time, never from user input or the server.
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]),
  );
}
