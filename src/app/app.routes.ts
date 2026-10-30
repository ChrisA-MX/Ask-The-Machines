import { Routes } from '@angular/router';
import { Landing } from './components/landing/landing';
import { Storyline } from './storyline/storyline';

export const routes: Routes = [
	{ path: '', component: Landing },
	{ path: 'storylines', component: Storyline },
];
