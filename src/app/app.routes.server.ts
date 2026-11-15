import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'storylines/:worldId/:machineId',
    renderMode: RenderMode.Client,
  },
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'storylines', renderMode: RenderMode.Prerender },
  { path: 'missions', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  {
    // Unknown addresses render the not-found page and report a real 404 to browsers and crawlers.
    path: '**',
    renderMode: RenderMode.Server,
    status: 404,
  }
];
