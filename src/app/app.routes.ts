import { Routes } from '@angular/router';
import { Landing } from './components/landing/landing';
import { Storyline } from './storyline/storyline';
import { MissionLab } from './mission-lab/mission-lab';

export const routes: Routes = [
	{ path: '', component: Landing },
	{ path: 'storylines', component: Storyline },
	{ path: 'storylines/:worldId/:machineId', loadComponent: () => import('./storyline/story-page/story-page').then((module) => module.StoryPage) },
	{ path: 'missions', component: MissionLab },
	{ path: 'about', title: 'About and credits | Ask the Machines', loadComponent: () => import('./components/about/about').then((module) => module.About) },
	{ path: '**', title: 'Page not found | Ask the Machines', loadComponent: () => import('./components/not-found/not-found').then((module) => module.NotFound) },
];
