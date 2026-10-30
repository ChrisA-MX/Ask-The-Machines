import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Stage } from './components/stage/stage';

@Component({
  imports: [RouterOutlet, Stage],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
