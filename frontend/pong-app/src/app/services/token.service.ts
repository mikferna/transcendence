import { Injectable } from '@angular/core';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private readonly ACCESS_TOKEN_KEY = 'access_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly TOKEN_EXPIRY_KEY = 'token_expiry';

  constructor() {}

  setTokens(access: string, refresh: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, access);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refresh);
    
    try {
      const decodedToken: any = jwtDecode(access);
      const expiryTime = decodedToken.exp * 1000; // Convertir a milisegundos
      localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
    } catch (error) {
      console.error('Error decoding token:', error);
      // Si hay un error al decodificar el token, establecer una expiración por defecto
      const defaultExpiry = new Date().getTime() + (15 * 60 * 1000); // 15 minutos
      localStorage.setItem(this.TOKEN_EXPIRY_KEY, defaultExpiry.toString());
    }
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  removeTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
  }

  isTokenExpired(): boolean {
    const expiryTime = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryTime) return true;
    
    const currentTime = new Date().getTime();
    return currentTime >= parseInt(expiryTime);
  }

  // Nuevo método para comprobar si el token está próximo a expirar (últimos 5 minutos)
  isTokenNearExpiry(): boolean {
    const expiryTime = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryTime) return false;
    
    const currentTime = new Date().getTime();
    const timeToExpiry = parseInt(expiryTime) - currentTime;
    
    // Comprobar si estamos en los últimos 5 minutos (300000 ms)
    return timeToExpiry > 0 && timeToExpiry <= 300000;
  }

  // Obtener tiempo restante para expiración en milisegundos
  getTokenTimeRemaining(): number {
    const expiryTime = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryTime) return 0;
    
    const currentTime = new Date().getTime();
    return Math.max(0, parseInt(expiryTime) - currentTime);
  }
}