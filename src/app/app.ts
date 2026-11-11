import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Stage } from './components/stage/stage';
import { ChatWidget } from './components/chat-widget/chat-widget';

@Component({
  imports: [RouterOutlet, Stage, ChatWidget],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
