import { Component, ViewEncapsulation, AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatrixService } from './services/matrix.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AppComponent implements AfterViewInit, OnDestroy {
  title = 'NeoPong'; // Título del juego

  constructor(
    private router: Router,
    private matrixService: MatrixService,
    public authService: AuthService
  ) {} // Inyectamos Router, MatrixService y AuthService

  //- Se ejecuta cuando la vista está completamente cargada
  //- Inicia el efecto Matrix de fondo con un pequeño retraso
  //- Configura un detector para ajustar el fondo cuando cambia el tamaño de la ventana
  ngAfterViewInit(): void {
    // Inicializar el fondo de Matrix después de que el DOM está completamente cargado
    setTimeout(() => {
      this.matrixService.initMatrix();
    }, 100);
    
    // Manejar el cambio de tamaño de ventana
    window.addEventListener('resize', () => {
      this.matrixService.handleResize();
    });
  }

  //- Se ejecuta cuando el componente va a ser eliminado
  //- Limpia recursos y detiene animaciones para evitar pérdidas de memoria
  ngOnDestroy(): void {
    // Detener la animación de Matrix cuando el componente se destruye
    this.matrixService.stopMatrix();
  }

  // Método para navegar a las rutas
  selectMode(mode: string) {
    this.router.navigate([`/${mode}`]); // Redirige a la ruta correspondiente
  }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  ngOnInit() {
  // Si el usuario está logueado y no hay idioma de sesión seleccionado,
  // usar el idioma por defecto del usuario
  const isLoggedIn = this.authService.isLoggedIn();
  if (isLoggedIn && !localStorage.getItem('selectedLanguage')) {
    const defaultLanguage = localStorage.getItem('defaultLanguage');
    if (defaultLanguage) {
      localStorage.setItem('selectedLanguage', defaultLanguage);
    }
  }
}
}