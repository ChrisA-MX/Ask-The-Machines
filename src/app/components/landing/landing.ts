import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ProfileMenu } from '../profile-menu/profile-menu';
import { VoyagerTracker } from '../voyager-tracker/voyager-tracker';

@Component({
  imports: [RouterLink, RouterLinkActive, ProfileMenu, VoyagerTracker],
  selector: 'app-landing',
  styleUrl: './landing.css',
  templateUrl: './landing.html',
})
export class Landing {
  protected askApollo(): void {
    window.dispatchEvent(new CustomEvent('ask-apollo'));
  }
}
