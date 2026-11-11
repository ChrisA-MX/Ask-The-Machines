import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArtifactMap } from '../components/artifact-map/artifact-map';
import { ApolloGame } from '../components/apollo-game/apollo-game';

@Component({
  selector: 'app-mission-lab',
  imports: [RouterLink, ArtifactMap, ApolloGame],
  templateUrl: './mission-lab.html',
  styleUrl: './mission-lab.scss',
})
export class MissionLab {}
