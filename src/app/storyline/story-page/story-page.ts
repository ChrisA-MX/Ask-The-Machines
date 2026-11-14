import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, inject, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, SafeResourceUrl, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProgressService } from '../../services/progress.service';
import { MachineStory, StoryVideo, WORLDS, WorldStory, WorldId } from '../machines.data';
import { StorylineNavigationService } from '../storyline-navigation.service';

export type StoryRouteResolution =
  | { kind: 'not-found' }
  | { kind: 'locked'; world: WorldStory; machine: MachineStory; index: number }
  | { kind: 'story'; world: WorldStory; machine: MachineStory; index: number };

export function findStoryRoute(worldId: string | null, routeId: string | null): { world: WorldStory; machine: MachineStory; index: number } | null {
  if (!worldId || !routeId) return null;
  const world = WORLDS.find((entry) => entry.id === worldId);
  if (!world) return null;
  const index = world.machines.findIndex((entry) => (entry.routeId ?? entry.id) === routeId);
  return index < 0 ? null : { world, machine: world.machines[index], index };
}

export function isStoryUnlocked(world: WorldStory, index: number, completed: ReadonlySet<string>): boolean {
  return world.machines.slice(0, index).every((machine) => completed.has(machine.id));
}

export function resolveStoryRoute(worldId: string | null, routeId: string | null, completed: ReadonlySet<string>): StoryRouteResolution {
  const match = findStoryRoute(worldId, routeId);
  if (!match) return { kind: 'not-found' };
  return isStoryUnlocked(match.world, match.index, completed) ? { kind: 'story', ...match } : { kind: 'locked', ...match };
}

@Component({
  selector: 'app-story-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './story-page.html',
  styleUrl: './story-page.scss',
})
export class StoryPage {
  protected readonly resolution = signal<StoryRouteResolution>({ kind: 'not-found' });
  protected readonly storyComplete = signal(false);
  protected readonly completedCount = signal(0);
  protected readonly completionMessage = signal('');
  protected readonly readProgress = signal(0);
  protected readonly speechAvailable = signal(false);
  protected readonly speechPlaying = signal(false);
  protected readonly videoStarted = signal(false);
  protected readonly videoLoaded = signal(false);
  protected readonly videoFailed = signal(false);
  protected readonly posterFailed = signal(false);
  protected readonly videoEmbed = signal<SafeResourceUrl | null>(null);
  protected readonly canReturnToTrail = signal(false);
  protected readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly progress = inject(ProgressService);
  private readonly navigationState = inject(StorylineNavigationService);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('storyHeading');
  private synthesis?: SpeechSynthesis;
  private videoTimeout?: number;
  private scrollFrame = 0;
  private destroyed = false;

  constructor() {
    this.progress.restore();
    this.canReturnToTrail.set(this.navigationState.peek() !== null);
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.resolve(params.get('worldId'), params.get('machineId'));
    });
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.initializeSpeech();
        this.updateReadingProgress();
        window.addEventListener('scroll', this.onScroll, { passive: true });
      });
    }
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.stopSpeech();
      this.clearVideoTimeout();
      if (isPlatformBrowser(this.platformId)) {
        window.removeEventListener('scroll', this.onScroll);
        window.cancelAnimationFrame(this.scrollFrame);
      }
    });
  }

  protected world(): WorldStory | null {
    const state = this.resolution();
    return state.kind === 'not-found' ? null : state.world;
  }

  protected machine(): MachineStory | null {
    const state = this.resolution();
    return state.kind === 'not-found' ? null : state.machine;
  }

  protected isLocked(): boolean { return this.resolution().kind === 'locked'; }
  protected isNotFound(): boolean { return this.resolution().kind === 'not-found'; }
  protected video(): StoryVideo | undefined { return this.machine()?.video; }
  protected previousMachine(): MachineStory | null {
    const state = this.resolution();
    return state.kind === 'story' ? state.world.machines[state.index - 1] ?? null : null;
  }
  protected nextMachine(): MachineStory | null {
    const state = this.resolution();
    return state.kind === 'story' && this.storyComplete() ? state.world.machines[state.index + 1] ?? null : null;
  }
  protected storyNumber(): number {
    const state = this.resolution();
    return state.kind === 'not-found' ? 0 : state.index + 1;
  }
  protected storyCount(): number { return this.world()?.machines.length ?? 4; }
  protected worldProgressPercent(): number {
    return this.storyCount() ? this.completedCount() / this.storyCount() * 100 : 0;
  }
  protected embedUrl(video: StoryVideo): SafeResourceUrl {
    const start = video.startSeconds ? `&start=${video.startSeconds}` : '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${video.youtubeId}?rel=0&modestbranding=1&playsinline=1&autoplay=1${start}`);
  }
  protected youtubeUrl(video: StoryVideo): string { return `https://www.youtube.com/watch?v=${video.youtubeId}`; }

  protected backToTrail(): void {
    this.stopSpeech();
    this.clearVideoTimeout();
    if (this.canReturnToTrail()) window.history.back();
    else {
      const world = this.world();
      const machine = this.machine();
      if (world && machine) this.navigationState.remember({ worldId: world.id, machineId: machine.id, scrollY: 0 });
      void this.router.navigateByUrl('/storylines');
    }
  }

  protected finishStory(): void {
    const machine = this.machine();
    const world = this.world();
    if (!machine || !world || this.isLocked() || this.isNotFound()) return;
    if (!this.storyComplete()) this.progress.setCompletedStoryIds([...this.progress.completedStoryIds(), machine.id]);
    this.storyComplete.set(true);
    this.refreshProgress(world);
    this.completionMessage.set(`${machine.name} marked finished. Your progress is saved on this device.`);
  }

  protected goToStory(target: MachineStory, replaceUrl = true): void {
    const world = this.world();
    if (!world || !isStoryUnlocked(world, world.machines.indexOf(target), new Set(this.progress.completedStoryIds()))) return;
    this.stopSpeech();
    this.clearVideoTimeout();
    this.navigationState.remember({ worldId: world.id, machineId: target.id, scrollY: window.scrollY });
    void this.router.navigate(['/storylines', world.id, target.routeId ?? target.id], { replaceUrl });
  }

  protected goToMiniGame(): void {
    const world = this.world();
    if (!world) return;
    this.stopSpeech();
    this.navigationState.remember({ worldId: world.id, machineId: this.machine()?.id ?? world.machines.at(-1)!.id, scrollY: 0 });
    if (this.canReturnToTrail()) this.backToTrail();
    else void this.router.navigateByUrl('/storylines');
  }

  protected startVideo(): void {
    const video = this.video();
    if (!video || !isPlatformBrowser(this.platformId)) return;
    this.videoFailed.set(false);
    this.videoLoaded.set(false);
    this.videoStarted.set(true);
    this.videoEmbed.set(this.embedUrl(video));
    this.clearVideoTimeout();
    this.videoTimeout = window.setTimeout(() => {
      if (!this.videoLoaded()) {
        this.videoFailed.set(true);
        this.videoEmbed.set(null);
      }
    }, 12000);
  }

  protected onVideoLoad(): void {
    this.videoLoaded.set(true);
    this.videoFailed.set(false);
    this.clearVideoTimeout();
  }

  protected onVideoError(): void {
    this.videoFailed.set(true);
    this.videoEmbed.set(null);
    this.clearVideoTimeout();
  }

  protected videoPoster(): string {
    const video = this.video();
    return video ? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg` : '';
  }

  protected listen(): void {
    if (!this.speechAvailable() || !this.synthesis) return;
    if (this.speechPlaying()) {
      this.synthesis.pause();
      this.speechPlaying.set(false);
      return;
    }
    if (this.synthesis.paused) {
      this.synthesis.resume();
      this.speechPlaying.set(true);
      return;
    }
    const content = this.machine()?.storyPage;
    if (!content) return;
    const ordered = [content.whoIAm, content.howIWorked, content.whatIFound, this.machine()?.fact ?? '', content.currentStatus].join('. ');
    const utterance = new SpeechSynthesisUtterance(ordered);
    utterance.lang = 'en-US';
    utterance.onstart = () => this.speechPlaying.set(true);
    utterance.onend = () => this.speechPlaying.set(false);
    utterance.onerror = () => this.speechPlaying.set(false);
    this.synthesis.speak(utterance);
  }

  protected stopListening(): void { this.stopSpeech(); }
  protected markPosterFailed(): void { this.posterFailed.set(true); }

  protected sources(): Array<{ label: string; url: string }> {
    const machine = this.machine();
    if (!machine) return [];
    return [
      ...(machine.sourceUrl ? [{ label: machine.sourceLabel, url: machine.sourceUrl }] : []),
      ...(machine.additionalSources ?? []),
    ];
  }

  private readonly onScroll = (): void => {
    if (this.scrollFrame) return;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = 0;
      this.updateReadingProgress();
    });
  };

  private resolve(worldId: string | null, routeId: string | null): void {
    const next = resolveStoryRoute(worldId, routeId, new Set(this.progress.completedStoryIds()));
    this.resolution.set(next);
    this.completionMessage.set('');
    this.videoStarted.set(false);
    this.videoLoaded.set(false);
    this.videoFailed.set(false);
    this.posterFailed.set(false);
    this.videoEmbed.set(null);
    this.clearVideoTimeout();
    if (next.kind === 'not-found') {
      this.storyComplete.set(false);
      this.completedCount.set(0);
      this.titleService.setTitle('Story not found | Ask the Machines');
      this.meta.updateTag({ name: 'description', content: 'This story could not be found. Return to Ask the Machines stories to choose another mission.' });
    } else {
      this.storyComplete.set(this.progress.completedStoryIds().includes(next.machine.id));
      this.refreshProgress(next.world);
      this.titleService.setTitle(`${next.machine.name} | Ask the Machines`);
      this.meta.updateTag({ name: 'description', content: next.machine.hook });
    }
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      afterNextRender(() => {
        if (!this.destroyed) this.heading()?.nativeElement.focus({ preventScroll: true });
      }, { injector: this.injector });
    }
  }

  private refreshProgress(world: WorldStory): void {
    this.completedCount.set(world.machines.filter((entry) => this.progress.completedStoryIds().includes(entry.id)).length);
  }

  private initializeSpeech(): void {
    if (!isPlatformBrowser(this.platformId) || !('speechSynthesis' in window)) return;
    this.synthesis = window.speechSynthesis;
    this.speechAvailable.set(true);
  }

  private stopSpeech(): void {
    this.synthesis?.cancel();
    this.speechPlaying.set(false);
  }

  private clearVideoTimeout(): void {
    if (this.videoTimeout !== undefined && isPlatformBrowser(this.platformId)) window.clearTimeout(this.videoTimeout);
    this.videoTimeout = undefined;
  }

  private updateReadingProgress(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const root = document.documentElement;
    const maxScroll = Math.max(root.scrollHeight - window.innerHeight, 1);
    this.readProgress.set(Math.min(100, Math.max(0, window.scrollY / maxScroll * 100)));
  }
}
