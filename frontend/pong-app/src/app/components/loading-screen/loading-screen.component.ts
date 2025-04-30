import { Component, OnInit  } from '@angular/core';

@Component({
  selector: 'app-loading-screen',
  templateUrl: './loading-screen.component.html',
  styleUrls: ['./loading-screen.component.scss']
})
export class LoadingScreenComponent implements OnInit {
  currentLanguage: string = 'es';
  currentTexts: any;
  translations: any = {
    es: {
      loading_system: 'INICIANDO SISTEMA'
    },
    eus: {
      loading_system: 'SISTEMA ABIATZEN'
    },
    en: {
      loading_system: 'LOADING SYSTEM'
    }
  };

  ngOnInit(): void {
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    this.currentTexts = this.translations[this.currentLanguage];
  }
}