import { afterNextRender, Component, DestroyRef, inject, Injector } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Stage } from './components/stage/stage';
import { ChatWidget } from './components/chat-widget/chat-widget';
import { LoadingScreen } from './components/loading-screen/loading-screen';
import { Landing } from './components/landing/landing';
import { LoadingService } from './services/loading.service';

@Component({
  imports: [RouterOutlet, Stage, ChatWidget, LoadingScreen],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly loading = inject(LoadingService);
  private readonly router = inject(Router, { optional: true });
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isLoading = this.loading.isLoading;
  protected showLandingPlanets = false;
  protected earthFocused = false;
  private finishNavigationLoading?: () => void;
  private initialRouteReady = false;
  private documentLoaded = false;
  private startupFinishScheduled = false;

  constructor() {
    this.router?.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.finishNavigationLoading?.();
        this.finishNavigationLoading = this.loading.begin();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.finishNavigationLoading?.();
        this.finishNavigationLoading = undefined;
      }
      if (event instanceof NavigationEnd) this.markInitialRouteReady();
    });

    afterNextRender(() => {
      if (document.readyState === 'complete') {
        this.onDocumentLoad();
      } else {
        window.addEventListener('load', this.onDocumentLoad, { once: true });
        this.destroyRef.onDestroy(() => window.removeEventListener('load', this.onDocumentLoad));
      }
    });
  }

  protected onRouteActivate(component: unknown): void {
    this.showLandingPlanets = component instanceof Landing;
    if (!this.showLandingPlanets) this.earthFocused = false;
    this.markInitialRouteReady();
  }

  protected onEarthFocusChange(focused: boolean): void {
    this.earthFocused = focused && this.showLandingPlanets;
  }

  private readonly onDocumentLoad = (): void => {
    this.documentLoaded = true;
    this.tryFinishStartup();
  };

  private markInitialRouteReady(): void {
    this.initialRouteReady = true;
    this.tryFinishStartup();
  }

  private tryFinishStartup(): void {
    if (!this.initialRouteReady || !this.documentLoaded || this.startupFinishScheduled) return;
    this.startupFinishScheduled = true;
    afterNextRender(() => this.loading.finishStartup(), { injector: this.injector });
  }
}
