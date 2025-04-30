import { Component, OnInit } from '@angular/core';

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
export class GameModeSelectorComponent implements OnInit{

  // Añadimos estas tres propiedades:
  currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
  currentTexts: any;
  translations: any = {
    es: {
      play_name: 'Jugar',
      play_description: 'Ve con cuidado',
    },
    eus: {
      play_name: 'Jokatu',
      play_description: 'Kontuz ibili',
    },
    en: {
      play_name: 'Play',
      play_description: 'Be Safe',
    }
  };

  // Definir los modos de juego con los valores predeterminados
  gameModes: GameMode[] = [
    {
      name: "NeoPong", // Traducido
      description: "^", // Traducido
      active: false
    },
  ];
  


  ngOnInit() {
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);

  }

    // Método para actualizar los modos de juego según el idioma actual
    updateGameModes(): void {
      this.gameModes = [
        {
          name: "NeoPong", // Traducido
          description: "^", // Traducido
          active: false
        },
      ];
    }
  
    selectGameMode(selectedMode: GameMode): void {
      // Reset all game modes
      this.gameModes.forEach(mode => {
        mode.active = false;
      });
      
      // Set selected mode as active
      selectedMode.active = true;
      
    };
}