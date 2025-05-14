import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth-success',
  template: `
    <div class="auth-success-container">
      <h2>Autenticando...</h2>
      <div class="spinner" *ngIf="isLoading"></div>
      <div *ngIf="error" class="error-message">{{ error }}</div>
    </div>
  `,
  standalone: true,
  imports: [CommonModule],
  styles: [`
    .auth-success-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
    }
    .error-message {
      color: red;
      margin-top: 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class AuthSuccessComponent implements OnInit {
  error: string = '';
  isLoading: boolean = true;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
  setTimeout(() => {  
    const urlParams = new URLSearchParams(window.location.search);
    const access = urlParams.get('access');
    const refresh = urlParams.get('refresh');
    const api_token = urlParams.get('ft_token');

    if (access && refresh && api_token) {
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      localStorage.setItem('ft_api_token', api_token);
      this.authService.handle42Callback(access, refresh);
      this.isLoading = false;
      this.router.navigate(['/home']);
    } else {
      this.error = 'No se recibieron los tokens de autenticación';
      this.isLoading = false;
      setTimeout(() => this.router.navigate(['/login']), 3000);
    }
  });
  }
}