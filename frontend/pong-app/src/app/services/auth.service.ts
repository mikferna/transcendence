import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, throwError } from 'rxjs';
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
  default_language?: string; // Optional property
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
        // Al hacer login, siempre establecer el idioma de sesión al idioma por defecto del usuario
        if (response.default_language) {
          localStorage.setItem('defaultLanguage', response.default_language);
          localStorage.setItem('selectedLanguage', response.default_language);
        }
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

  register(username: string, email: string, password: string, password2: string, default_language: string): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/register/`, {
      username,
      email,
      password,
      password2,
      default_language
    }).pipe(
      tap(response => {
        if (response.default_language) {
          localStorage.setItem('selectedLanguage', response.default_language);
        }
      })
    );
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

  updateCurrentUser(): Observable<any> {
    return this.getCurrentUser().pipe(
      tap(user => {
        console.log('Usuario actualizado:', user);
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.API_URL}/logout/`, {
      refresh: this.tokenService.getRefreshToken()
    }).pipe(
      tap(() => {
        this.tokenService.removeTokens();
        localStorage.removeItem('currentUser');
        // Al hacer logout, mantener selectedLanguage pero eliminar defaultLanguage
        localStorage.removeItem('defaultLanguage');
        this.currentUserSubject.next(null);
        this.router.navigate(['/']);
      })
    );
  }

  isLoggedIn(): boolean {
    return !this.tokenService.isTokenExpired();
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  refreshToken(): Observable<{ access: string; refresh?: string }> {
    const refreshToken = this.tokenService.getRefreshToken();
    
    if (!refreshToken) {
      // Si no hay refresh token, logout y devolver un error
      this.logout().subscribe();
      return throwError(() => new Error('No refresh token available'));
    }
    
    return this.http.post<{ access: string; refresh?: string }>(
      `${this.API_URL}/token/refresh/`, 
      { refresh: refreshToken }
    ).pipe(
      tap(response => {
        // Si recibimos un nuevo token de acceso, actualizar en el servicio
        if (response.access) {
          if (response.refresh) {
            // Si también hay nuevo refresh token (ROTATE_REFRESH_TOKENS=True)
            this.tokenService.setTokens(response.access, response.refresh);
          } else {
            // Si solo hay nuevo token de acceso, mantener el refresh token actual
            this.tokenService.setTokens(response.access, refreshToken);
          }
        }
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