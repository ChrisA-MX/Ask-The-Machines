import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoadingService);
  });

  it('keeps the overlay active until all loads finish', () => {
    service.finishStartup();
    const finishEarthLoad = service.begin();
    const finishNavigation = service.begin();

    expect(service.isLoading()).toBe(true);
    finishEarthLoad();
    expect(service.isLoading()).toBe(true);

    finishNavigation();
    expect(service.isLoading()).toBe(false);
  });

  it('finishes a load only once', () => {
    service.finishStartup();
    const finishLoad = service.begin();
    finishLoad();
    finishLoad();

    expect(service.isLoading()).toBe(false);
  });

  it('keeps the overlay active until startup is explicitly finished', () => {
    expect(service.isLoading()).toBe(true);

    service.finishStartup();
    service.finishStartup();

    expect(service.isLoading()).toBe(false);
  });
});
