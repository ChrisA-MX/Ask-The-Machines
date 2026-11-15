import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MachineViewer } from './machine-viewer';
import { ProfileMenu } from '../components/profile-menu/profile-menu';

@Component({
  selector: 'app-mission-lab',
  imports: [RouterLink, RouterLinkActive, MachineViewer, ProfileMenu],
  templateUrl: './mission-lab.html',
  styleUrl: './mission-lab.scss',
})
export class MissionLab {}
