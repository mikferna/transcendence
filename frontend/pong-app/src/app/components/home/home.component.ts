import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  currentLanguage: string = 'es'; 
  currentTexts: any;

  translations: any = {
    es: {
      select_game_mode: 'Selecciona el modo de juego',
      play: 'JUGAR'
    },
    eus: {
      select_game_mode: 'Aukeratu joko modua',
      play: 'JOKATU'
    },
    en: {
      select_game_mode: 'Select Game Mode',
      play: 'PLAY'
    }
  };

  constructor(private router: Router) {}

  ngOnInit() {
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    this.currentTexts = this.translations[this.currentLanguage];
    console.log('Idioma seleccionado:', this.currentLanguage);
  }

  matchmenu(): void {
    this.router.navigate(['/match']);
  }
}
