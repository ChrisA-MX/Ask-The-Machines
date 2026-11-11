import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, ViewChild } from '@angular/core';
import type { Map as LeafletMap, Marker as LeafletMarker, TileLayer } from 'leaflet';

type Planet = 'Moon' | 'Mars';

interface Artifact {
  id: string;
  name: string;
  planet: Planet;
  site: string;
  coordinates: [number, number];
  year: string;
  story: string;
  fact: string;
  source: string;
  sourceUrl: string;
}

@Component({ selector: 'app-artifact-map', templateUrl: './artifact-map.html', styleUrl: './artifact-map.scss' })
export class ArtifactMap {
  @ViewChild('mapCanvas') private mapCanvas?: ElementRef<HTMLDivElement>;

  protected readonly planet = signal<Planet>('Moon');
  protected readonly selectedArtifact = signal<Artifact | null>(null);
  protected readonly mapError = signal('');

  /** Mock story copy; replace with the final researched machine story when ready. */
  protected readonly artifacts: Artifact[] = [
    {
      id: 'apollo-11-descent-stage',
      name: 'Apollo 11 Lunar Module Descent Stage',
      planet: 'Moon',
      site: 'Tranquility Base · Sea of Tranquility',
      coordinates: [0.67408, 23.47297],
      year: '1969',
      story: 'The Apollo 11 Lunar Module brought Neil Armstrong and Buzz Aldrin down to the Moon. Its lower descent stage stayed at Tranquility Base when the astronauts lifted off in the ascent stage.',
      fact: 'The landing site is at about 0.674° north and 23.473° east.',
      source: 'NASA Apollo 11 mission summary',
      sourceUrl: 'https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm',
    },
    {
      id: 'opportunity-rover',
      name: 'Opportunity Rover',
      planet: 'Mars',
      site: 'Endeavour Crater · approximate location',
      coordinates: [-2.2758, -5.1808],
      year: '2011',
      story: 'Opportunity explored the rim of Endeavour Crater, studying rocks that preserve clues about ancient environments on Mars. This marker shows the approximate crater location, not the rover’s exact position.',
      fact: 'Endeavour Crater is about 22 km wide; this plotted coordinate marks the crater area.',
      source: 'U.S. Geological Survey',
      sourceUrl: 'https://www.usgs.gov/publications/context-ancient-aqueous-environments-mars-situ-geologic-mapping-endeavour-crater',
    },
  ];

  private readonly destroyRef = inject(DestroyRef);
  private map?: LeafletMap;
  private leaflet?: typeof import('leaflet');
  private tileLayer?: TileLayer;
  private markers: LeafletMarker[] = [];
  private destroyed = false;

  constructor() {
    // Leaflet touches browser APIs, so load it only after Angular renders in the browser.
    afterNextRender(() => void this.initializeMap());
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.map?.remove();
    });
  }

  protected setPlanet(planet: Planet): void {
    if (this.planet() === planet) return;
    this.planet.set(planet);
    this.selectedArtifact.set(null);
    this.renderPlanet();
  }

  protected closeStory(): void {
    this.selectedArtifact.set(null);
  }

  private async initializeMap(): Promise<void> {
    try {
      const leaflet = await import('leaflet');
      if (this.destroyed || !this.mapCanvas) return;
      this.leaflet = leaflet;
      this.map = leaflet.map(this.mapCanvas.nativeElement, {
        crs: leaflet.CRS.EPSG4326,
        center: [0, 23],
        zoom: 3,
        minZoom: 0,
        maxZoom: 9,
        worldCopyJump: false,
        zoomControl: false,
        attributionControl: true,
      });
      leaflet.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.renderPlanet();
    } catch {
      this.mapError.set('The planetary map could not load. Check your connection and try again.');
    }
  }

  private renderPlanet(): void {
    if (!this.map || !this.leaflet) return;
    const L = this.leaflet;
    this.tileLayer?.remove();
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];

    const isMoon = this.planet() === 'Moon';
    const tileUrl = isMoon
      ? 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'
      : 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg';

    this.tileLayer = L.tileLayer(tileUrl, {
      minZoom: 0,
      maxZoom: 9,
      noWrap: true,
      bounds: L.latLngBounds([-90, -180], [90, 180]),
      attribution: 'Tiles: <a href="https://trek.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA/JPL Solar System Treks</a>',
    }).addTo(this.map);

    const visibleArtifacts = this.artifacts.filter((artifact) => artifact.planet === this.planet());
    for (const artifact of visibleArtifacts) {
      const marker = L.marker(artifact.coordinates, {
        title: `${artifact.name} at ${artifact.site}`,
        alt: `${artifact.name} marker`,
        icon: L.divIcon({ className: 'artifact-marker-icon', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      })
        .addTo(this.map)
        .on('click', () => this.selectedArtifact.set(artifact));
      this.markers.push(marker);
    }

    const activeArtifact = visibleArtifacts[0];
    this.map.setView(activeArtifact?.coordinates ?? [0, 0], isMoon ? 3 : 2);
    setTimeout(() => this.map?.invalidateSize(), 0);
  }
}
