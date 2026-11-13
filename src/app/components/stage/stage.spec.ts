import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Stage } from './stage';

describe('Stage', () => {
  let component: Stage;
  let fixture: ComponentFixture<Stage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stage],
    }).compileComponents();

    fixture = TestBed.createComponent(Stage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('only renders Earth and Moon when planets are enabled', () => {
    const stage = fixture.nativeElement as HTMLElement;

    expect(stage.querySelector('.earth')).toBeNull();
    expect(stage.querySelector('.moon')).toBeNull();

    fixture.componentRef.setInput('showPlanets', true);
    fixture.detectChanges();

    expect(stage.querySelector('.earth')).toBeTruthy();
    expect(stage.querySelector('.moon')).toBeTruthy();
  });
});
