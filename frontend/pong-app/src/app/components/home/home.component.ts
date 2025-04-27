import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit{
  // Añadimos estas tres propiedades:
  currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
  currentTexts: any;
  translations: any = {
    es: {
      select_game_mode: 'Selecciona el modo de juego',
    },
    en: {
      select_game_mode: 'Select Game Mode',
    }
  };

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
}