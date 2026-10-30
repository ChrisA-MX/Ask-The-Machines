import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface StorylineCard {
  id: string;
  name: string;
}

@Component({
  imports: [RouterLink],
  selector: 'app-storyline',
  styleUrl: './storyline.css',
  templateUrl: './storyline.html',
})
export class Storyline {
  protected readonly storylines: StorylineCard[] = [
    { id: 'machine-1', name: 'Machine 1' },
    { id: 'machine-2', name: 'Machine 2' },
    { id: 'machine-3', name: 'Machine 3' },
    { id: 'machine-4', name: 'Machine 4' },
  ];
}
