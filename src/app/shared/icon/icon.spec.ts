import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Icon } from './icon';
import { ICONS } from './icons';

describe('Icon', () => {
  let fixture: ComponentFixture<Icon>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Icon] }).compileComponents();
    fixture = TestBed.createComponent(Icon);
    element = fixture.nativeElement;
  });

  it('renders the named icon as inline SVG, hidden from screen readers', async () => {
    fixture.componentRef.setInput('name', 'user');
    await fixture.whenStable();

    const svg = element.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('icon-tabler-user');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(element.getAttribute('data-icon')).toBe('user');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(element.getAttribute('role')).toBeNull();
  });

  it('is announced as an image with its label when it has one', async () => {
    fixture.componentRef.setInput('name', 'bell');
    fixture.componentRef.setInput('label', 'Notifications');
    await fixture.whenStable();

    expect(element.getAttribute('role')).toBe('img');
    expect(element.getAttribute('aria-label')).toBe('Notifications');
    expect(element.getAttribute('aria-hidden')).toBeNull();
  });

  it('switches icons when the name changes', async () => {
    fixture.componentRef.setInput('name', 'sun');
    await fixture.whenStable();
    fixture.componentRef.setInput('name', 'moon');
    await fixture.whenStable();

    expect(element.querySelector('svg')?.getAttribute('class')).toContain('icon-tabler-moon');
  });

  it('has real SVG markup for every icon in the list', () => {
    for (const [name, markup] of Object.entries(ICONS)) {
      expect(markup, name).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    }
  });
});
