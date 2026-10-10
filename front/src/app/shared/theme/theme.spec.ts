import { TestBed } from '@angular/core/testing';
import { Theme } from './theme';

describe('Theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('should start from the saved choice', () => {
    localStorage.setItem('artemis-theme', 'dark');

    expect(TestBed.inject(Theme).mode()).toBe('dark');
  });

  it('should toggle, apply and remember the mode', () => {
    const theme = TestBed.inject(Theme);
    const initial = theme.mode();
    const next = initial === 'dark' ? 'light' : 'dark';

    theme.toggle();
    TestBed.tick();

    expect(theme.mode()).toBe(next);
    expect(document.documentElement.dataset['theme']).toBe(next);
    expect(localStorage.getItem('artemis-theme')).toBe(next);
  });
});
