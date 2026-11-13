import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { LoadingScreen } from './loading-screen';

describe('LoadingScreen', () => {
  let component: LoadingScreen;
  let fixture: ComponentFixture<LoadingScreen>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingScreen],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingScreen);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the overlay only while loading', () => {
    const overlay = fixture.nativeElement.querySelector('.loading-overlay') as HTMLElement;
    expect(overlay.classList.contains('is-visible')).toBe(false);

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(overlay.classList.contains('is-visible')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
  });
});
