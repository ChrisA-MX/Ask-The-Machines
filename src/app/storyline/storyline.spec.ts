import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Storyline } from './storyline';

describe('Storyline', () => {
  let component: Storyline;
  let fixture: ComponentFixture<Storyline>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Storyline],
    }).compileComponents();

    fixture = TestBed.createComponent(Storyline);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
