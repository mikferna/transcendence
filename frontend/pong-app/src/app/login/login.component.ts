import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  error: string = '';
  isLoading: boolean = false;

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
