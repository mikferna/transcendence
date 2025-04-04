import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      password2: ['', [Validators.required]]
    }, { validator: this.passwordMatchValidator });
  }

  ngOnInit(): void {
    // Si ya está logueado, redirigir a home
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('password2')?.value
      ? null : { 'mismatch': true };
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.isLoading = true;
      this.error = '';
      
      const { username, email, password, password2 } = this.registerForm.value;
      
      this.authService.register(username, email, password, password2).subscribe({
        next: () => {
          this.isLoading = false;
          // Redirigir al login después de un registro exitoso
          this.router.navigate(['/login']);
        },
        error: (err) => {
          this.isLoading = false;
          if (err.error && err.error.username) {
            this.error = 'El nombre de usuario ya está en uso';
          } else if (err.error && err.error.email) {
            this.error = 'El correo electrónico ya está en uso';
          } else if (err.error && err.error.password) {
            this.error = 'Las contraseñas no coinciden';
          } else {
            this.error = 'Error al registrarse. Por favor, inténtalo de nuevo.';
          }
        }
      });
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
} 