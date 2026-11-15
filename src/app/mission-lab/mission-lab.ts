import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MachineViewer } from './machine-viewer';

@Component({
  selector: 'app-mission-lab',
  imports: [RouterLink, RouterLinkActive, MachineViewer],
  templateUrl: './mission-lab.html',
  styleUrl: './mission-lab.scss',
})
export class MissionLab {}
