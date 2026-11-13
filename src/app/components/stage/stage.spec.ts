import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { Stage } from './stage';

describe('Stage', () => {
  let component: Stage;
  let fixture: ComponentFixture<Stage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stage],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    }).compileComponents();

    fixture = TestBed.createComponent(Stage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('only renders the interactive Earth when planets are enabled', () => {
    const stage = fixture.nativeElement as HTMLElement;

    expect(stage.querySelector('.earth')).toBeNull();

    fixture.componentRef.setInput('showPlanets', true);
    fixture.detectChanges();

    expect(stage.querySelector('.earth canvas[tabindex="0"]')).toBeTruthy();
    expect(stage.querySelector('.moon')).toBeNull();
  });

  it('enters Earth focus only when the model is activated', () => {
    fixture.componentRef.setInput('showPlanets', true);
    fixture.detectChanges();
    const focusChange = vi.fn();
    component.focusChange.subscribe(focusChange);

    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas');
    canvas?.click();

    expect(focusChange).toHaveBeenCalledWith(true);
  });
});
