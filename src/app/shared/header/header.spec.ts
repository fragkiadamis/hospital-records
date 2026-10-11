import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('title', 'Hospital Records');
    fixture.componentRef.setInput('userName', 'John Papadopoulos');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the user name and initial', () => {
    expect(element.querySelector('[aria-haspopup="menu"]')?.textContent).toContain(
      'John Papadopoulos',
    );
    expect(element.querySelector('.avatar')?.textContent?.trim()).toBe('J');
  });

  it('should show the title', () => {
    expect(element.querySelector('.brand-name')?.textContent?.trim()).toBe('Hospital Records');
  });

  it('should show the unread badge only when there are unread notifications', async () => {
    expect(element.querySelector('.badge')).toBeNull();

    fixture.componentRef.setInput('hasUnreadNotifications', true);
    await fixture.whenStable();

    expect(element.querySelector('.badge')).not.toBeNull();
  });

  it('should toggle the theme', async () => {
    const before = document.documentElement.dataset['theme'];

    element.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
    await fixture.whenStable();

    expect(document.documentElement.dataset['theme']).not.toBe(before);
  });
});
