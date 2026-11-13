import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, OnDestroy, PLATFORM_ID, SimpleChanges, ViewChild, inject } from '@angular/core';

@Component({
  selector: 'app-loading-screen',
  styleUrl: './loading-screen.css',
  templateUrl: './loading-screen.html',
})
export class LoadingScreen implements OnChanges, OnDestroy {
  @Input() loading = false;

  private readonly platformId = inject(PLATFORM_ID);
  private canvas?: HTMLCanvasElement;
  private animation?: import('@lottiefiles/dotlottie-web').DotLottie;
  private loadRequest = 0;

  @ViewChild('animationCanvas')
  set animationCanvas(element: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvas = element?.nativeElement;
    if (this.loading) void this.startAnimation();
    else this.pauseAnimation();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['loading']) return;
    if (this.loading) void this.startAnimation();
    else this.pauseAnimation();
  }

  ngOnDestroy(): void {
    this.destroyAnimation();
  }

  private async startAnimation(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.canvas) return;
    if (this.animation) {
      this.animation.play();
      return;
    }

    const request = ++this.loadRequest;
    const canvas = this.canvas;

    try {
      const { DotLottie } = await import('@lottiefiles/dotlottie-web');
      if (request !== this.loadRequest || !this.loading || !canvas.isConnected) return;
      this.animation = new DotLottie({
        canvas,
        src: '/assets/NASA-loading-screen-defualt.lottie',
        autoplay: true,
        loop: true,
        useFrameInterpolation: true,
        backgroundColor: 'transparent',
      });
    } catch (error) {
      if (request !== this.loadRequest) return;
      console.error('The NASA loading animation could not be initialized.', error);
    }
  }

  private pauseAnimation(): void {
    this.loadRequest++;
    this.animation?.pause();
  }

  private destroyAnimation(): void {
    this.loadRequest++;
    this.animation?.destroy();
    this.animation = undefined;
  }
}
