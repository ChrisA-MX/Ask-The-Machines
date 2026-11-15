import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ProfileMenu } from '../profile-menu/profile-menu';
import { VoyagerTracker } from '../voyager-tracker/voyager-tracker';
import { AI_CREDITS, ASSET_CREDITS, LIBRARY_CREDITS } from '../../data/credits';
import { LAB_MODELS } from '../../data/lab-models';
import { MACHINES } from '../../storyline/machines.data';

interface SourceLink { label: string; url: string; machines: string[] }

function collectSources(): SourceLink[] {
  const byUrl = new Map<string, SourceLink>();
  for (const machine of MACHINES) {
    for (const fact of machine.facts) {
      if (!fact.sourceUrl) continue;
      const entry = byUrl.get(fact.sourceUrl) ?? { label: fact.source, url: fact.sourceUrl, machines: [] };
      if (!entry.machines.includes(machine.name)) entry.machines.push(machine.name);
      byUrl.set(fact.sourceUrl, entry);
    }
  }
  return [...byUrl.values()];
}

@Component({
  selector: 'app-about',
  imports: [RouterLink, RouterLinkActive, ProfileMenu, VoyagerTracker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  protected readonly sources = collectSources();
  protected readonly factCount = MACHINES.reduce((total, machine) => total + machine.facts.length, 0);
  protected readonly machineCount = MACHINES.length;
  protected readonly videos = MACHINES.map((machine) => ({
    machine: machine.name,
    title: machine.video.title,
    channel: machine.video.channel,
    url: `https://www.youtube.com/watch?v=${machine.video.youtubeId}`,
  }));
  protected readonly models = LAB_MODELS.filter((model) => !!model.credit);
  protected readonly libraries = LIBRARY_CREDITS;
  protected readonly ai = AI_CREDITS;
  protected readonly assets = ASSET_CREDITS;
}
