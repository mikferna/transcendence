import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule]
})
export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;

  // Añadimos estas tres propiedades:
  currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
  currentTexts: any;
  translations: any = {
    es: {
      registry: 'Registro',
      insert_user: 'Usuario',
      user_required: 'El ususario es requerido',
      user_characters: 'El usuario debe tener al menos 3 caracteres',
      user_contains_forbidden: 'El nombre de usuario no puede contener "42"',
      insert_email: 'Correo Electrónico',
      email_required: 'El correo electrónico es requerido',
      email_characters: 'Ingresa un correo electrónico válido',
      insert_password: 'Contraseña',
      password_required: 'La contraseña es requerida',
      password_characters: 'La contraseña debe tener al menos 6 caracteres',
      confirm_password: 'Confirmar Contraseña',
      password_confirmation_required: 'La confirmación de contraseña es requerida',
      registering: "Registrando...",
      register: "Registrarse",
      already_registered: '¿Ya tienes una cuenta?',
      login: 'Inicia sesión',
      username_on_use: 'El nombre de usuario ya está en uso',
      email_on_use: 'El correo electrónico ya está en uso',
      password_mismatch: 'Las contraseñas no coinciden',
      registry_error: 'Error al registrarse. Por favor, inténtalo de nuevo.',
      select_language: 'Seleccionar idioma',
      spanish: 'Español',
      basque: 'Euskera',
      english: 'Inglés'
    },
    eus: {
        registry: 'Erregistroa',
        insert_user: 'Erabiltzailea',
        user_required: 'Erabiltzailea beharrezkoa da',
        user_characters: 'Erabiltzaileak gutxienez 3 karaktere izan behar ditu',
        user_contains_forbidden: 'Erabiltzaile izenak ezin du "42" izan',
        insert_email: 'Posta elektronikoa',
        email_required: 'Posta elektronikoa beharrezkoa da',
        email_characters: 'Sartu baliozko posta elektronikoa',
        insert_password: 'Pasahitza',
        password_required: 'Pasahitza beharrezkoa da',
        password_characters: 'Pasahitzak gutxienez 6 karaktere izan behar ditu',
        confirm_password: 'Pasahitza berretsi',
        password_confirmation_required: 'Pasahitzaren berrespena beharrezkoa da',
        registering: "Erregistratzen...",
        register: "Erregistratu",
        already_registered: 'Dagoeneko kontu bat duzu?',
        login: 'Hasi saioa',
        username_on_use: 'Erabiltzaile izena dagoeneko erabilita dago',
        email_on_use: 'Posta elektronikoa dagoeneko erabilita dago',
        password_mismatch: 'Pasahitzak ez datoz bat',
        registry_error: 'Errorea erregistratzean. Saiatu berriro, mesedez.',
        select_language: 'Hizkuntza aukeratu',
        spanish: 'Gaztelania',
        basque: 'Euskara',
        english: 'Ingelesa'
    },
    en: {
      registry: 'Registry',
      insert_user: 'Username',
      user_required: 'A user name is required',
      user_characters: 'The user name must have at least 3 characters',
      user_contains_forbidden: 'Username cannot contain "42"',
      insert_email: 'Email',
      email_required: 'Email is required',
      email_characters: 'Please enter a valid email address',
      insert_password: 'Password',
      password_required: 'Password is required',
      password_characters: 'Password must be at least 6 characters',
      confirm_password: 'Confirm Password',
      password_confirmation_required: 'Password confirmation is required',
      registering: 'Registering...',
      register: 'Register',
      already_registered: 'Do you already have an account?',
      login: 'Log in',
      username_on_use: 'Username is already in use',
      email_on_use: 'Email is already in use',
      password_mismatch: 'Passwords do not match',
      registry_error: 'Registration failed. Please try again.',
      select_language: 'Select language',
      spanish: 'Spanish',
      basque: 'Basque',
      english: 'English'
    }
  };

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group({
      username: ['', [
        Validators.required, 
        Validators.minLength(3),
        this.forbiddenUsernameValidator()
      ]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      password2: ['', Validators.required],
      default_language: ['es', Validators.required]
    }, {
      validators: this.passwordMatchValidator // Añadir el validator aquí
    });
  }

  ngOnInit() {
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

  // Validador personalizado para prohibir "42" en el nombre de usuario
  forbiddenUsernameValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const forbidden = control.value && control.value.toString().includes('42');
      return forbidden ? { 'forbidden42': true } : null;
    };
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('password2')?.value
      ? null : { 'mismatch': true };
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.isLoading = true;
      this.error = '';
      
      const { username, email, password, password2, default_language } = this.registerForm.value;
      
      this.authService.register(username, email, password, password2, default_language).subscribe({
        next: () => {
          this.isLoading = false;
          // Redirigir al login después de un registro exitoso
          this.router.navigate(['/login']);
        },
        error: (err: any) => {
          this.isLoading = false;
          if (err.error && err.error.username) {
            this.error = this.translations[this.currentLanguage].username_on_use;
          } else if (err.error && err.error.email) {
            this.error = this.translations[this.currentLanguage].email_on_use;
          } else if (err.error && err.error.password) {
            this.error = this.translations[this.currentLanguage].password_mismatch;
          } else {
            this.error = this.translations[this.currentLanguage].registry_error;
          }
        }
      });
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}