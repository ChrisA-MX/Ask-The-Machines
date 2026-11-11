import { Routes } from '@angular/router';
import { Landing } from './components/landing/landing';
import { Storyline } from './storyline/storyline';
import { MissionLab } from './mission-lab/mission-lab';

export const routes: Routes = [
	{ path: '', component: Landing },
	{ path: 'storylines', component: Storyline },
	{ path: 'missions', component: MissionLab },
];
