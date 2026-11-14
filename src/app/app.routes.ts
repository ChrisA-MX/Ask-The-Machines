import { Routes } from '@angular/router';
import { Landing } from './components/landing/landing';
import { Storyline } from './storyline/storyline';
import { MissionLab } from './mission-lab/mission-lab';

export const routes: Routes = [
	{ path: '', component: Landing },
	{ path: 'storylines', component: Storyline },
	{ path: 'storylines/:worldId/:machineId', loadComponent: () => import('./storyline/story-page/story-page').then((module) => module.StoryPage) },
	{ path: 'missions', component: MissionLab },
];
