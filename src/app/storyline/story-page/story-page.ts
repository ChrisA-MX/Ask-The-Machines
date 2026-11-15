import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, inject, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, SafeResourceUrl, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProgressService } from '../../services/progress.service';
import { buildMachineImageUrl, MachineStory, StoryVideo, WORLDS, WorldStory } from '../machines.data';
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

export function splitStoryParagraphs(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z“"‘])/g).map((sentence) => sentence.trim()).filter(Boolean);
}

export const SPEECH_VOICE_PREFERENCES = {
  natural: ['natural', 'neural'],
  google: ['google us english', 'google uk english female'],
  apple: ['ava', 'samantha', 'allison', 'susan', 'daniel', 'karen', 'moira'],
  legacyMicrosoft: ['microsoft david', 'microsoft zira', 'microsoft mark'],
} as const;

export const SPEECH_PRONUNCIATION_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bALSEP\b/gi, 'Al-sep'],
  [/\bCernan\b/gi, 'Sernan'],
  [/\bTombaugh\b/gi, 'Tom-baw'],
  [/\bKuiper\b/gi, 'Kyper'],
  [/[--]170\s*°\s*C/gi, 'minus 170 degrees Celsius'],
  [/(?<!\d)1%(?!\w)/g, '1 percent'],
  [/\bmagnitude-5\b/gi, 'magnitude 5'],
];

const SPEECH_SETTINGS_KEY = 'atm-voice-settings';
const VOICE_RANKS = { natural: 4000, google: 3000, apple: 2000, english: 1000, legacy: 100 } as const;
const LANG_RANKS: Readonly<Record<string, number>> = { 'en-us': 30, 'en-gb': 20, 'en-au': 10 };

export interface SpeechVoicePreference {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
}

export function scoreSpeechVoice(voice: SpeechVoicePreference): number {
  if (!voice.lang.toLowerCase().startsWith('en')) return Number.NEGATIVE_INFINITY;
  const name = voice.name.toLowerCase();
  const languageRank = LANG_RANKS[voice.lang.toLowerCase()] ?? 0;
  if (SPEECH_VOICE_PREFERENCES.legacyMicrosoft.some((legacy) => name.includes(legacy))) {
    return VOICE_RANKS.legacy + languageRank;
  }
  if (SPEECH_VOICE_PREFERENCES.natural.some((term) => name.includes(term))) {
    return VOICE_RANKS.natural + languageRank;
  }
  if (SPEECH_VOICE_PREFERENCES.google.some((term) => name.includes(term))) {
    return VOICE_RANKS.google + languageRank;
  }
  if (SPEECH_VOICE_PREFERENCES.apple.some((namePart) => new RegExp(`\\b${namePart}\\b`, 'i').test(voice.name))) {
    const qualityBonus = /enhanced|premium/i.test(voice.name) ? 50 : 0;
    return VOICE_RANKS.apple + qualityBonus + languageRank;
  }
  return VOICE_RANKS.english + languageRank;
}

export function rankEnglishSpeechVoices<T extends SpeechVoicePreference>(voices: readonly T[]): T[] {
  return voices
    .filter((voice) => Number.isFinite(scoreSpeechVoice(voice)))
    .map((voice, index) => ({ voice, index, score: scoreSpeechVoice(voice) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ voice }) => voice);
}

export function chunkSpeechText(text: string, maxCharacters = 180): string[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token;
    if (current && next.length > maxCharacters) {
      chunks.push(current);
      current = token;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function prepareSpeechText(text: string): string {
  return SPEECH_PRONUNCIATION_REPLACEMENTS.reduce(
    (spoken, [pattern, replacement]) => spoken.replace(pattern, replacement),
    text,
  );
}

type HighlightSection = 'title' | 'whoIAm' | 'howIWorked' | 'whatIFound' | 'sidebarTitle' | 'sidebarText' | 'whereIAmNow';
interface NarrationChunk { text: string; section: HighlightSection; sentence: number; }

export function resolveStoryRoute(worldId: string | null, routeId: string | null, completed: ReadonlySet<string>): StoryRouteResolution {
  const match = findStoryRoute(worldId, routeId);
  if (!match) return { kind: 'not-found' };
  return isStoryUnlocked(match.world, match.index, completed) ? { kind: 'story', ...match } : { kind: 'locked', ...match };
}

@Component({
  selector: 'app-story-page',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
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
  protected readonly speechSupportChecked = signal(false);
  protected readonly speechPlaying = signal(false);
  protected readonly speechActive = signal(false);
  protected readonly speechPaused = signal(false);
  protected readonly voiceLoading = signal(true);
  protected readonly availableVoices = signal<SpeechSynthesisVoice[]>([]);
  protected readonly selectedVoiceURI = signal('');
  protected readonly recommendedVoiceURI = signal('');
  protected readonly speechRate = signal(0.95);
  protected readonly speechAnnouncement = signal('');
  protected readonly listenDiscoveryVisible = signal(false);
  protected readonly stickyPlayerVisible = signal(false);
  protected readonly imageFailed = signal(false);
  protected readonly lightboxOpen = signal(false);
  protected readonly factCheckExpanded = signal(false);
  protected readonly highlightedSpeech = signal<{ section: HighlightSection; sentence: number } | null>(null);
  protected readonly videoStarted = signal(false);
  protected readonly videoLoaded = signal(false);
  protected readonly videoFailed = signal(false);
  protected readonly posterFailed = signal(false);
  protected readonly videoEmbed = signal<SafeResourceUrl | null>(null);
  protected readonly canReturnToTrail = signal(false);
  protected readonly miniGameComplete = signal(false);
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
  private readonly audioBar = viewChild<ElementRef<HTMLElement>>('audioBar');
  private readonly imageTrigger = viewChild<ElementRef<HTMLButtonElement>>('imageTrigger');
  private readonly lightboxClose = viewChild<ElementRef<HTMLButtonElement>>('lightboxClose');
  private synthesis?: SpeechSynthesis;
  private voiceChangeHandler?: () => void;
  private voiceRetryTimer?: number;
  private pauseFallbackTimer?: number;
  private speechTimer?: number;
  private sectionPauseTimer?: number;
  private savedVoiceURI = '';
  private narration: NarrationChunk[] = [];
  private currentChunkIndex = 0;
  private speechGeneration = 0;
  private stalledChunkIndex = -1;
  private stalledChunkRetries = 0;
  private fallbackPaused = false;
  private videoTimeout?: number;
  private discoveryTimer?: number;
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
      if (this.voiceChangeHandler) this.synthesis?.removeEventListener('voiceschanged', this.voiceChangeHandler);
      if (this.voiceRetryTimer !== undefined && isPlatformBrowser(this.platformId)) window.clearInterval(this.voiceRetryTimer);
      this.clearVideoTimeout();
      if (this.discoveryTimer !== undefined && isPlatformBrowser(this.platformId)) window.clearTimeout(this.discoveryTimer);
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
  protected paragraphs(text: string): string[] { return splitStoryParagraphs(text); }
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

  protected machineImageUrl(story: MachineStory, variant?: 400 | 800): string {
    const baseHref = isPlatformBrowser(this.platformId)
      ? document.querySelector('base')?.getAttribute('href') || '/'
      : '/';
    if (variant) return buildMachineImageUrl(story.routeId, baseHref).replace(/\.jpg$/, `-${variant}.webp`);
    const defaultPath = buildMachineImageUrl(story.routeId);
    const image = story.image ?? defaultPath;
    return image === defaultPath ? buildMachineImageUrl(story.routeId, baseHref) : image;
  }

  protected machineImageSrcset(story: MachineStory): string {
    return `${this.machineImageUrl(story, 400)} 400w, ${this.machineImageUrl(story, 800)} 800w`;
  }

  protected imageLoadFailed(): void { this.imageFailed.set(true); }

  protected openLightbox(): void {
    if (this.imageFailed()) return;
    this.lightboxOpen.set(true);
    afterNextRender(() => this.lightboxClose()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeLightbox(): void {
    if (!this.lightboxOpen()) return;
    this.lightboxOpen.set(false);
    afterNextRender(() => this.imageTrigger()?.nativeElement.focus(), { injector: this.injector });
  }

  protected onLightboxBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeLightbox();
  }

  protected toggleFactCheck(): void { this.factCheckExpanded.update((expanded) => !expanded); }

  protected estimatedMinutes(): number {
    const story = this.machine();
    if (!story) return 1;
    const words = [story.name, story.storyPage.whoIAm, story.storyPage.howIWorked, story.storyPage.whatIFound,
      story.sidebar?.title ?? '', story.sidebar?.text ?? '', story.storyPage.whereIAmNow]
      .join(' ').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / (150 * this.speechRate())));
  }

  protected narrationProgress(): number {
    return this.narration.length ? Math.min(100, Math.round((this.currentChunkIndex / this.narration.length) * 100)) : 0;
  }

  protected resetRecommendedVoice(): void {
    const recommended = this.recommendedVoiceURI();
    if (!recommended || recommended === this.selectedVoiceURI()) return;
    this.applyVoice(recommended);
  }

  private applyVoice(voiceURI: string, wasActive = this.speechActive(), wasPaused = this.speechPaused()): void {
    let sentenceStart = this.currentChunkIndex;
    const active = this.narration[sentenceStart];
    while (sentenceStart > 0 && active && this.narration[sentenceStart - 1]?.section === active.section
      && this.narration[sentenceStart - 1]?.sentence === active.sentence) sentenceStart--;
    this.cancelSpeechState();
    this.selectedVoiceURI.set(voiceURI);
    this.savedVoiceURI = voiceURI;
    this.persistSpeechSettings();
    if (wasActive) this.restoreReadingAt(sentenceStart, wasPaused);
  }

  private initListenDiscovery(): void {
    try {
      if (localStorage.getItem('atm-listen-seen') === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.listenDiscoveryVisible.set(true);
      this.discoveryTimer = window.setTimeout(() => this.listenDiscoveryVisible.set(false), 8000);
    } catch {
      // The player remains available if browser storage is blocked.
    }
  }

  private markListenSeen(): void {
    this.listenDiscoveryVisible.set(false);
    if (this.discoveryTimer !== undefined) window.clearTimeout(this.discoveryTimer);
    try { localStorage.setItem('atm-listen-seen', 'true'); } catch { /* Storage is optional. */ }
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeLightbox();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector<HTMLElement>('.story-image-lightbox');
    const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  protected listen(): void {
    if (!this.speechAvailable() || !this.synthesis) return;
    if (this.speechActive()) {
      if (this.speechPaused()) this.resumeSpeech();
      else this.pauseSpeech();
      return;
    }
    const machine = this.machine();
    const content = machine?.storyPage;
    if (!machine || !content) return;
    this.markListenSeen();
    this.startReading(0);
  }

  protected stopListening(): void { this.stopSpeech(); }
  protected markPosterFailed(): void { this.posterFailed.set(true); }

  protected chooseVoice(event: Event): void {
    const voiceURI = (event.target as HTMLSelectElement).value;
    if (!this.availableVoices().some((voice) => voice.voiceURI === voiceURI) || voiceURI === this.selectedVoiceURI()) return;
    const wasActive = this.speechActive();
    const wasPaused = this.speechPaused();
    this.applyVoice(voiceURI, wasActive, wasPaused);
  }

  protected changeSpeechRate(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (![0.8, 0.9, 0.95, 1, 1.1].includes(value)) return;
    this.speechRate.set(value);
    this.persistSpeechSettings();
  }

  protected previewVoice(): void {
    if (!this.synthesis || !this.speechAvailable()) return;
    this.cancelSpeechState();
    const utterance = new SpeechSynthesisUtterance('Hi, I’m Apollo. Let’s meet the machines.');
    this.configureUtterance(utterance);
    const generation = this.speechGeneration;
    utterance.onstart = () => {
      if (generation === this.speechGeneration) this.speechPlaying.set(true);
    };
    utterance.onend = () => {
      if (generation === this.speechGeneration) this.speechPlaying.set(false);
    };
    utterance.onerror = () => {
      if (generation === this.speechGeneration) this.speechPlaying.set(false);
    };
    this.synthesis.speak(utterance);
  }

  protected isSpeechHighlighted(section: HighlightSection, sentence: number): boolean {
    const active = this.highlightedSpeech();
    return active?.section === section && active.sentence === sentence;
  }

  protected isTitleSpeechHighlighted(): boolean {
    return this.isSpeechHighlighted('title', 0);
  }

  private readonly onScroll = (): void => {
    if (this.scrollFrame) return;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = 0;
      this.updateReadingProgress();
      const bar = this.audioBar()?.nativeElement;
      this.stickyPlayerVisible.set(this.speechActive() && !!bar && bar.getBoundingClientRect().bottom < 8);
    });
  };

  private resolve(worldId: string | null, routeId: string | null): void {
    this.stopSpeech();
    const next = resolveStoryRoute(worldId, routeId, new Set(this.progress.completedStoryIds()));
    this.resolution.set(next);
    this.imageFailed.set(false);
    this.lightboxOpen.set(false);
    this.stickyPlayerVisible.set(false);
    this.factCheckExpanded.set(false);
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
      this.miniGameComplete.set(this.progress.completedMiniGameIds().includes(next.world.id));
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
    if (!isPlatformBrowser(this.platformId)) return;
    this.initListenDiscovery();
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      this.speechSupportChecked.set(true);
      return;
    }
    this.synthesis = window.speechSynthesis;
    this.speechAvailable.set(true);
    this.speechSupportChecked.set(true);
    this.loadSpeechSettings();
    this.voiceChangeHandler = () => { this.refreshVoices(); };
    this.synthesis.addEventListener('voiceschanged', this.voiceChangeHandler);
    if (!this.refreshVoices()) {
      let attempts = 0;
      this.voiceRetryTimer = window.setInterval(() => {
        attempts++;
        if (this.refreshVoices() || attempts >= 25) {
          if (attempts >= 25 && !this.availableVoices().length) this.voiceLoading.set(false);
          if (this.voiceRetryTimer !== undefined) window.clearInterval(this.voiceRetryTimer);
          this.voiceRetryTimer = undefined;
        }
      }, 200);
    }
  }

  private stopSpeech(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const wasActive = this.speechActive();
    this.cancelSpeechState();
    if (wasActive) this.speechAnnouncement.set('Reading stopped.');
    this.stickyPlayerVisible.set(false);
  }

  private refreshVoices(): boolean {
    if (!this.synthesis) return false;
    const voices = rankEnglishSpeechVoices(this.synthesis.getVoices()) as SpeechSynthesisVoice[];
    if (!voices.length) return false;
    this.availableVoices.set(voices);
    this.voiceLoading.set(false);
    const recommended = voices[0];
    this.recommendedVoiceURI.set(recommended.voiceURI);
    const chosen = voices.find((voice) => voice.voiceURI === this.savedVoiceURI)
      ?? voices.find((voice) => voice.voiceURI === this.selectedVoiceURI())
      ?? recommended;
    this.selectedVoiceURI.set(chosen.voiceURI);
    if (!this.savedVoiceURI) this.savedVoiceURI = chosen.voiceURI;
    return true;
  }

  private loadSpeechSettings(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.savedVoiceURI = localStorage.getItem('atm-voice') ?? '';
      const settings = JSON.parse(localStorage.getItem(SPEECH_SETTINGS_KEY) ?? '{}') as { rate?: unknown };
      const rate = Number(settings.rate);
      if ([0.8, 0.9, 0.95, 1, 1.1].includes(rate)) this.speechRate.set(rate);
    } catch {
      this.savedVoiceURI = '';
    }
  }

  private persistSpeechSettings(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem('atm-voice', this.selectedVoiceURI());
      localStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify({ rate: this.speechRate() }));
    } catch {
      // Speech remains usable when browser storage is disabled or full.
    }
  }

  private buildNarration(machine: MachineStory): NarrationChunk[] {
    const chunks: NarrationChunk[] = [];
    const add = (section: HighlightSection, text: string): void => {
      splitStoryParagraphs(text).forEach((sentence, sentenceIndex) => {
        for (const chunk of chunkSpeechText(prepareSpeechText(sentence))) {
          chunks.push({ text: chunk, section, sentence: sentenceIndex });
        }
      });
    };
    add('title', machine.name);
    add('whoIAm', machine.storyPage.whoIAm);
    add('howIWorked', machine.storyPage.howIWorked);
    add('whatIFound', machine.storyPage.whatIFound);
    if (machine.sidebar) {
      add('sidebarTitle', machine.sidebar.title);
      add('sidebarText', machine.sidebar.text);
    }
    add('whereIAmNow', machine.storyPage.whereIAmNow);
    return chunks;
  }

  private startReading(startIndex: number): void {
    const machine = this.machine();
    if (!machine || !this.synthesis) return;
    this.cancelSpeechState();
    this.narration = this.buildNarration(machine);
    this.currentChunkIndex = Math.max(0, Math.min(startIndex, this.narration.length - 1));
    this.speechActive.set(this.narration.length > 0);
    this.speechAnnouncement.set('Reading started.');
    this.stickyPlayerVisible.set(false);
    this.speechPaused.set(false);
    this.fallbackPaused = false;
    if (this.speechActive()) this.speakChunk(this.currentChunkIndex, this.speechGeneration);
  }

  private restoreReadingAt(index: number, paused: boolean): void {
    const machine = this.machine();
    if (!machine || !this.synthesis) return;
    this.narration = this.buildNarration(machine);
    if (!this.narration.length || index >= this.narration.length) return;
    this.currentChunkIndex = Math.max(0, index);
    this.speechActive.set(true);
    this.speechPaused.set(paused);
    this.fallbackPaused = paused;
    if (!paused) this.speakChunk(this.currentChunkIndex, this.speechGeneration);
  }

  private speakChunk(index: number, generation: number): void {
    if (!this.synthesis || generation !== this.speechGeneration || !this.speechActive() || this.speechPaused()) return;
    const chunk = this.narration[index];
    if (!chunk) {
      this.finishReading();
      return;
    }
    this.currentChunkIndex = index;
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    this.configureUtterance(utterance);
    utterance.onstart = () => {
      if (generation !== this.speechGeneration) return;
      this.speechPlaying.set(true);
      this.highlightedSpeech.set({ section: chunk.section, sentence: chunk.sentence });
    };
    utterance.onboundary = () => {
      if (generation === this.speechGeneration) this.highlightedSpeech.set({ section: chunk.section, sentence: chunk.sentence });
    };
    utterance.onpause = () => {
      if (generation !== this.speechGeneration) return;
      this.speechPaused.set(true);
      this.speechPlaying.set(false);
    };
    utterance.onresume = () => {
      if (generation !== this.speechGeneration) return;
      this.speechPaused.set(false);
      this.speechPlaying.set(true);
    };
    utterance.onend = () => {
      if (generation !== this.speechGeneration) return;
      this.clearSpeechTimer();
      this.stalledChunkIndex = -1;
      this.stalledChunkRetries = 0;
      const nextIndex = index + 1;
      this.currentChunkIndex = nextIndex;
      if (nextIndex >= this.narration.length) {
        this.finishReading();
        return;
      }
      this.speechPlaying.set(false);
      const sectionChanged = chunk.section !== this.narration[nextIndex].section;
      if (sectionChanged) {
        this.sectionPauseTimer = window.setTimeout(() => {
          this.sectionPauseTimer = undefined;
          this.speakChunk(nextIndex, generation);
        }, 400);
      } else {
        this.speakChunk(nextIndex, generation);
      }
    };
    utterance.onerror = (event) => {
      if (generation !== this.speechGeneration || event.error === 'canceled' || event.error === 'interrupted') return;
      this.clearSpeechTimer();
      this.finishReading();
    };
    this.synthesis.speak(utterance);
    const timeout = Math.max(20_000, (chunk.text.length / (12 * this.speechRate())) * 1000 + 12_000);
    this.speechTimer = window.setTimeout(() => this.recoverStalledSpeech(index, generation), timeout);
  }

  private configureUtterance(utterance: SpeechSynthesisUtterance): void {
    const voice = this.availableVoices().find((entry) => entry.voiceURI === this.selectedVoiceURI())
      ?? this.availableVoices()[0];
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = this.speechRate();
    utterance.pitch = 1;
  }

  private pauseSpeech(): void {
    if (!this.synthesis || !this.speechActive()) return;
    this.speechPaused.set(true);
    this.speechPlaying.set(false);
    this.speechAnnouncement.set('Reading paused.');
    const partialSynthesis = this.synthesis as SpeechSynthesis & { pause?: () => void };
    if (!this.synthesis.speaking) {
      this.enterFallbackPause();
      return;
    }
    try {
      if (typeof partialSynthesis.pause !== 'function') throw new Error('pause unsupported');
      partialSynthesis.pause();
    } catch {
      this.enterFallbackPause();
      return;
    }
    const generation = this.speechGeneration;
    this.pauseFallbackTimer = window.setTimeout(() => {
      this.pauseFallbackTimer = undefined;
      if (generation !== this.speechGeneration || !this.speechPaused() || this.synthesis?.paused) return;
      this.enterFallbackPause();
    }, 250);
  }

  private enterFallbackPause(): void {
    if (this.pauseFallbackTimer !== undefined) window.clearTimeout(this.pauseFallbackTimer);
    this.pauseFallbackTimer = undefined;
    this.clearSpeechTimer();
    if (this.sectionPauseTimer !== undefined) window.clearTimeout(this.sectionPauseTimer);
    this.sectionPauseTimer = undefined;
    this.speechGeneration++;
    this.synthesis?.cancel();
    this.fallbackPaused = true;
    this.speechPaused.set(true);
    this.speechPlaying.set(false);
    this.speechAnnouncement.set('Reading paused.');
  }

  private resumeSpeech(): void {
    if (!this.synthesis || !this.speechActive()) return;
    if (this.fallbackPaused || !this.synthesis.paused) {
      this.fallbackPaused = false;
      this.speechPaused.set(false);
      this.speechPlaying.set(true);
      this.speechAnnouncement.set('Reading started.');
      this.speakChunk(this.currentChunkIndex, this.speechGeneration);
      return;
    }
    try {
      this.synthesis.resume();
      this.speechPaused.set(false);
      this.speechPlaying.set(true);
      this.speechAnnouncement.set('Reading started.');
    } catch {
      this.enterFallbackPause();
    }
  }

  private recoverStalledSpeech(index: number, generation: number): void {
    this.speechTimer = undefined;
    if (generation !== this.speechGeneration || !this.speechActive() || this.speechPaused() || this.currentChunkIndex !== index) return;
    if (this.stalledChunkIndex === index && this.stalledChunkRetries >= 1) {
      this.stalledChunkIndex = -1;
      this.stalledChunkRetries = 0;
      this.synthesis?.cancel();
      const nextIndex = index + 1;
      this.currentChunkIndex = nextIndex;
      this.speechGeneration++;
      this.speakChunk(nextIndex, this.speechGeneration);
      return;
    }
    this.stalledChunkIndex = index;
    this.stalledChunkRetries++;
    this.synthesis?.cancel();
    this.speechGeneration++;
    this.speakChunk(index, this.speechGeneration);
  }

  private finishReading(): void {
    this.clearSpeechTimer();
    if (this.sectionPauseTimer !== undefined) window.clearTimeout(this.sectionPauseTimer);
    this.sectionPauseTimer = undefined;
    this.narration = [];
    this.speechActive.set(false);
    this.speechPaused.set(false);
    this.speechPlaying.set(false);
    this.highlightedSpeech.set(null);
    this.fallbackPaused = false;
    this.stickyPlayerVisible.set(false);
    this.speechAnnouncement.set('Reading finished.');
  }

  private cancelSpeechState(): void {
    this.speechGeneration++;
    this.clearSpeechTimer();
    if (this.pauseFallbackTimer !== undefined) window.clearTimeout(this.pauseFallbackTimer);
    if (this.sectionPauseTimer !== undefined) window.clearTimeout(this.sectionPauseTimer);
    this.pauseFallbackTimer = undefined;
    this.sectionPauseTimer = undefined;
    this.synthesis?.cancel();
    this.narration = [];
    this.currentChunkIndex = 0;
    this.speechActive.set(false);
    this.speechPaused.set(false);
    this.speechPlaying.set(false);
    this.highlightedSpeech.set(null);
    this.fallbackPaused = false;
    this.stalledChunkIndex = -1;
    this.stalledChunkRetries = 0;
  }

  private clearSpeechTimer(): void {
    if (this.speechTimer !== undefined) window.clearTimeout(this.speechTimer);
    this.speechTimer = undefined;
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
