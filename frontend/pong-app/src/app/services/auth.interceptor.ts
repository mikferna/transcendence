import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService, private tokenService: TokenService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // No aplicar lógica de token para endpoints de autenticación
    if (request.url.includes('token/refresh') || 
        request.url.includes('/login/') || 
        request.url.includes('/register/')) {
      return next.handle(request);
    }
    
    const token = this.tokenService.getAccessToken();
    
    if (token) {
      // Comprobar si el token está cerca de expirar (últimos 5 minutos)
      if (this.tokenService.isTokenNearExpiry() && !this.isRefreshing) {
        return this.refreshToken().pipe(
          switchMap((newToken: string) => {
            // Una vez tenemos el nuevo token, añadirlo a la petición original
            return next.handle(this.addToken(request, newToken));
          }),
          catchError(error => {
            // Si falla la renovación, continuar con el token actual
            return next.handle(this.addToken(request, token));
          })
        );
      }
      
      // Si no está por expirar o ya estamos refrescando, usar el token actual
      request = this.addToken(request, token);
    }

    return next.handle(request).pipe(
      catchError(error => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          // Si el error es 401, intentar renovar el token (para tokens que expiraron justo entre verificación y envío)
          return this.handle401Error(request, next);
        }
        
        return throwError(() => error);
      })
    );
  }

  private addToken(request: HttpRequest<any>, token: string) {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  private refreshToken(): Observable<string> {
    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);
    
    return this.authService.refreshToken().pipe(
      switchMap((response: any) => {
        this.isRefreshing = false;
        this.refreshTokenSubject.next(response.access);
        return new Observable<string>(observer => {
          observer.next(response.access);
          observer.complete();
        });
      }),
      catchError(error => {
        this.isRefreshing = false;
        this.authService.logout().subscribe();
        return throwError(() => error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler) {
    if (!this.isRefreshing) {
      return this.refreshToken().pipe(
        switchMap(newToken => {
          return next.handle(this.addToken(request, newToken));
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter(token => token != null),
        take(1),
        switchMap(jwt => {
          return next.handle(this.addToken(request, jwt));
        })
      );
    }
  }
}