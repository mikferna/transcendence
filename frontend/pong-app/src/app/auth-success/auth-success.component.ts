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
  imports: [CommonModule]
})
export class AuthSuccessComponent implements OnInit {
  error: string = '';
  isLoading: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const access = urlParams.get('access');
    const refresh = urlParams.get('refresh');

    if (access && refresh) {
      // Store tokens and redirect
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      this.authService.updateAuthState();
      this.router.navigate(['/home']);
    } else {
      this.error = 'No se recibieron los tokens de autenticación';
      setTimeout(() => this.router.navigate(['/login']), 3000);
    }
  }
}