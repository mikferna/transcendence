import { Component } from '@angular/core';

interface GameMode {
  name: string;
  description: string;
  active: boolean;
}

@Component({
  selector: 'app-game-mode-selector',
  templateUrl: './game-mode-selector.component.html',
  styleUrls: ['./game-mode-selector.component.scss']
})
export class GameModeSelectorComponent {
  gameModes: GameMode[] = [
    {
      name: 'Online',
      description: 'Play against opponents from around the world',
      active: false
    },
    {
      name: 'Solo',
      description: 'Practice your skills against AI',
      active: false
    },
    {
      name: 'LAN',
      description: 'Connect with friends on your local network',
      active: false
    }
  ];
  
  selectGameMode(selectedMode: GameMode): void {
    // Reset all game modes
    this.gameModes.forEach(mode => {
      mode.active = false;
    });
    
    // Set selected mode as active
    selectedMode.active = true;
    
    // Additional logic for game mode selection can be added here
  }
}