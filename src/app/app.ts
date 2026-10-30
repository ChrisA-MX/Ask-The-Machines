import { Component } from '@angular/core';
import { Landing } from './components/landing/landing';
import { Stage } from './components/stage/stage';

@Component({
  imports: [Landing, Stage],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
