import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Stage } from './components/stage/stage';
import { ChatWidget } from './components/chat-widget/chat-widget';
import { Landing } from './components/landing/landing';

@Component({
  imports: [RouterOutlet, Stage, ChatWidget],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected showLandingPlanets = false;
  protected earthFocused = false;

  protected onRouteActivate(component: unknown): void {
    this.showLandingPlanets = component instanceof Landing;
    if (!this.showLandingPlanets) this.earthFocused = false;
  }

  protected onEarthFocusChange(focused: boolean): void {
    this.earthFocused = focused && this.showLandingPlanets;
  }
}
