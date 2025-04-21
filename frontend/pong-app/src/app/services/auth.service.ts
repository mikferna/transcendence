import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { TokenService } from './token.service';

// Añadir esta interfaz al inicio del archivo, después de los imports
interface AuthResponse {
  access: string;
  refresh: string;
}

interface LoginResponse {
  access: string;
  refresh: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private readonly API_URL = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private router: Router,
    private tokenService: TokenService
  ) {
    // Intentar recuperar el usuario del localStorage al iniciar
    const user = localStorage.getItem('currentUser');
    if (user) {
      this.currentUserSubject.next(JSON.parse(user));
    }
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/login/`, {
      username,
      password
    }).pipe(
      tap(response => {
        this.tokenService.setTokens(response.access, response.refresh);
        this.getCurrentUser().subscribe();
      })
    );
  }

  handle42Callback(access: string, refresh: string): void {
    console.log('Processing 42 callback with tokens');
    console.log('Access token received:', access ? 'yes' : 'no');
    console.log('Refresh token received:', refresh ? 'yes' : 'no');

    if (access && refresh) {
      this.tokenService.setTokens(access, refresh);
      localStorage.setItem('is_42_user', 'true');  // Marcar como usuario de 42
      this.getCurrentUser().subscribe();
    }
  }

  //handle42Callback(code: string): Observable<AuthResponse> {
  //  return this.http.get<AuthResponse>(`${this.API_URL}/auth/callback/`, { 
  //    params: { code } 
  //  }).pipe(
  //    tap(response => {
  //      console.log('Received tokens from backend:', {
  //        access: response.access ? 'Token received' : 'No access token',
  //        refresh: response.refresh ? 'Token received' : 'No refresh token'
  //      });
  //      console.log('Full response:', response);
  //      this.tokenService.setTokens(response.access, response.refresh);
  //      this.getCurrentUser().subscribe();
  //    })
  //  );
  //}

  updateAuthState(): void {
    const accessToken = this.tokenService.getAccessToken();
    if (accessToken) {
      this.getCurrentUser().subscribe({
        next: (user) => {
          this.currentUserSubject.next(user);
        },
        error: (error) => {
          console.error('Error updating auth state:', error);
          this.logout();
        }
      });
    } else {
      this.currentUserSubject.next(null);
    }
  }

  register(username: string, email: string, password: string, password2: string): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/register/`, {
      username,
      email,
      password,
      password2
    });
  }

  getCurrentUser(): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/current-user/`).pipe(
      tap(user => {
        if (user && user.avatar) {
          // Asegurarse de que la URL del avatar es absoluta
          if (!user.avatar.startsWith('http')) {
            user.avatar = `${this.API_URL}${user.avatar}`;
          }
        }
        this.currentUserSubject.next(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
      })
    );
  }

  logout(): Observable<any> {
    const refreshToken = this.tokenService.getRefreshToken();
    const is42User = localStorage.getItem('is_42_user') === 'true';
    const ft_token = localStorage.getItem('ft_api_token');
    const accessToken = this.tokenService.getAccessToken();

    return this.http.post(`${this.API_URL}/logout/`, { refresh: refreshToken }).pipe(
      tap({
        next: () => {
          this.tokenService.removeTokens();
          localStorage.removeItem('currentUser');
          localStorage.removeItem('is_42_user');
          localStorage.removeItem('ft_api_token');
          this.currentUserSubject.next(null);

          this.router.navigate(['/']);
          // Si es usuario de 42, hacer logout también de 42
          //if (is42User && ft_token) {
          //  window.location.href = `https://api.intra.42.fr/oauth/logout?client_id=${environment.auth42.clientId}&access_token=${ft_token}`;
          //  //window.location.href = 'https://api.intra.42.fr/oauth/logout';
          //} else {
          //  // Redirigir a la página de inicio
          //  this.router.navigate(['/']);  
          //}
        },
        error: (error) => {
          console.error('Error during logout:', error);
          // Aún así limpiamos los tokens locales en caso de error
          this.tokenService.removeTokens();
          localStorage.removeItem('currentUser');
          localStorage.removeItem('is_42_user');
          localStorage.removeItem('ft_api_token');
          this.currentUserSubject.next(null);

          this.router.navigate(['/']);
          // Si es usuario de 42, hacer logout también de 42
          //if (is42User && accessToken) {
          //  window.location.href = `https://api.intra.42.fr/oauth/logout?client_id=${environment.auth42.clientId}&access_token=${ft_token}`;
          //} else {
          //  this.router.navigate(['/']);
          //}
        }
      })
    );
  }

  isLoggedIn(): boolean {
    return !this.tokenService.isTokenExpired();
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.tokenService.getRefreshToken();
    return this.http.post<AuthResponse>(`${this.API_URL}/token/refresh/`, { refresh: refreshToken })
      .pipe(
        tap(response => {
          this.tokenService.setTokens(response.access, response.refresh);
        })
      );
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }
} 