import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './not-found.css',
  template: `
    <main class="lost-page">
      <a class="brand" routerLink="/" aria-label="Ask the Machines home">ASK THE MACHINES</a>
      <section class="lost-card" aria-labelledby="lost-heading">
        <p class="eyebrow">ERROR 404 &middot; SIGNAL LOST</p>
        <h1 id="lost-heading">This page drifted <span>out of range.</span></h1>
        <p>Even Voyager 1 still calls home, but we can't find the page you asked for. Let's get you back on course.</p>
        <div class="lost-actions">
          <a class="primary" routerLink="/">Back to Earth</a>
          <a routerLink="/storylines">Read the stories</a>
          <a routerLink="/missions">Explore 3D models</a>
        </div>
      </section>
    </main>
  `,
})
export class NotFound {}
