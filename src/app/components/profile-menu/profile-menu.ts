import { afterNextRender, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AGE_RANGES, AgeRange, APOLLO_DEFAULT_NAME, PlayerProfileService } from '../../services/player-profile.service';

@Component({
  selector: 'app-profile-menu',
  imports: [FormsModule],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.css',
})
export class ProfileMenu {
  private readonly profile = inject(PlayerProfileService);
  protected readonly ageRanges = AGE_RANGES;
  protected readonly isOpen = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly name = signal('');
  protected readonly ageRange = signal<AgeRange | ''>('');
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => {
      if (!this.profile.hasProfile() && !this.profile.onboardingDismissed()) this.openProfile();
    });
  }

  protected openProfile(): void {
    this.name.set(this.profile.avatarName() !== APOLLO_DEFAULT_NAME ? this.profile.avatarName() : '');
    this.ageRange.set(this.profile.ageRange() ?? '');
    this.error.set('');
    this.isEditing.set(this.profile.hasProfile());
    this.isOpen.set(true);
  }

  protected dismiss(): void {
    this.isOpen.set(false);
    this.profile.dismissOnboarding();
  }

  protected save(): void {
    if (!this.profile.saveProfile(this.name(), this.ageRange() as AgeRange)) {
      this.error.set('Please enter your name and choose an age range.');
      return;
    }
    this.error.set('');
    this.isOpen.set(false);
  }
}
