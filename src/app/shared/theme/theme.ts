import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

// Also read by the inline script in index.html, which applies the theme before Angular boots.
const STORAGE_KEY = 'artemis-theme';

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>(this.initialMode());

  constructor() {
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.mode();
    });
  }

  toggle(): void {
    this.mode.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
    try {
      localStorage.setItem(STORAGE_KEY, this.mode());
    } catch {
      // Storage can be unavailable (private mode, blocked site data); the choice just won't persist.
    }
  }

  // A saved choice wins; otherwise follow the OS preference.
  private initialMode(): ThemeMode {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // Storage can be unavailable (private mode, blocked site data); fall back to the OS preference.
    }
    const prefersDark = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    return prefersDark?.matches ? 'dark' : 'light';
  }
}
