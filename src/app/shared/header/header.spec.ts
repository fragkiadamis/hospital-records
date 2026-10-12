import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([
          { path: 'patients', children: [] },
          { path: 'patients/:id', children: [] },
          { path: 'endpoints', children: [] },
          { path: 'endpoints/:id', children: [] },
        ]),
      ],
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

  describe('sections', () => {
    const links = () => [...element.querySelectorAll<HTMLAnchorElement>('nav.sections a')];
    const navigate = async (url: string) => {
      await TestBed.inject(Router).navigateByUrl(url);
      await fixture.whenStable();
    };

    it('links to Patients and Endpoints', () => {
      expect(links().map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
        ['Patients', '/patients'],
        ['Endpoints', '/endpoints'],
      ]);
    });

    it('marks the section of the open page, including the pages under it', async () => {
      await navigate('/endpoints/pacs-dicomweb');

      expect(links().map((a) => a.classList.contains('active'))).toEqual([false, true]);
      expect(links()[1].getAttribute('aria-current')).toBe('page');
      expect(links()[0].hasAttribute('aria-current')).toBe(false);

      await navigate('/patients/p1');
      expect(links().map((a) => a.classList.contains('active'))).toEqual([true, false]);
    });
  });
});
