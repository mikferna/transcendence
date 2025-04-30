import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule]
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;

// Añadimos estas tres propiedades:
currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
currentTexts: any;
translations: any = {
  es: {
    insert_user: 'Usuario',
    email: 'Contraseña',
    insert_email: 'Inserte un correo electrónico',
    login_in: 'Iniciar Sesión',
    login: 'Iniciando sesión...',
    no_account: '¿No tienes una cuenta? ',
    register: 'Regístrate',
    login_42: 'Login 42'
    },
  eus: {
      insert_user: 'Erabiltzailea',
      email: 'Pasahitza',
      insert_email: 'Sartu helbide elektronikoa',
      login_in: 'Saioa hasi',
      login: 'Saioa hasten...',
      no_account: 'Ez duzu konturik? ',
      register: 'Erregistratu',
      login_42: '42 saioa hasi'
  },
  en: {
    insert_user: 'User',
    email: 'Password',
    insert_email: 'Insert an email address',
    login_in: 'Log In',
    login: 'Logging in...',
    no_account: 'You don\'t have an account? ',
    register: 'Register',
    login_42: 'Login 42'
  }
};
  
  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Si ya está logueado, redirigir a home
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }

    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);
  

  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.error = '';
      
      const { username, password } = this.loginForm.value;
      
      this.authService.login(username, password).subscribe({
        next: () => {
          this.router.navigate(['/home']);
        },
        error: (err) => {
          this.isLoading = false;
          if (err.status === 401) {
            this.error = 'Usuario o contraseña incorrectos';
          } else {
            this.error = 'Error al iniciar sesión. Por favor, inténtalo de nuevo.';
          }
        }
      });
    }
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  login42(): void {
  
    try {
      const loadingScreenElement = document.querySelector('.loading-screen') as HTMLElement;
      if (loadingScreenElement) {
        loadingScreenElement.style.display = 'flex';
      }

      localStorage.removeItem('ft_api_token');
      localStorage.removeItem('is_42_user');
            
      const timestamp = new Date().getTime();
      window.location.href = `${environment.apiUrl}/auth/authorize/?force_verify=true&t=${timestamp}`;
    } catch (error) {
      console.error('Error initiating 42 login:', error);
    }
  }
  
}
