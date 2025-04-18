import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

interface User {
  id: number;
  username: string;
  avatar?: string;
  is_online: boolean;
}

// Interfaz actualizada para incluir usernames
interface Match {
  id: number;
  player1: number;
  player1_username: string;
  player2: number | null;
  player2_username: string | null;
  is_against_ai: boolean;
  ai_difficulty?: string;
  player1_score: number;
  player2_score: number;
  winner: number | null;
  winner_username: string | null;
  is_player1_winner: boolean;
  match_date: string;
  match_type: string;
}

interface MatchHistoryResponse {
  message: string;
  matches: Match[];
}

interface MatchCreateResponse {
  message: string;
  match: Match;
}

@Injectable({
  providedIn: 'root'
})
export class MatchService {
  
  constructor(private http: HttpClient) { }
  
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }
  
  /**
   * Obtiene el usuario actualmente autenticado
   */
  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/current-user/`, {
      headers: this.getHeaders()
    });
  }
  
  /**
   * Busca usuarios por una consulta
   * @param query Texto para buscar usuarios
   */
  searchUsers(query: string): Observable<User[]> {
    return this.http.get<User[]>(`${environment.apiUrl}/users/search/?query=${query}`, {
      headers: this.getHeaders()
    });
  }
  
  /**
   * Crea un nuevo partido contra la IA
   */
  createAIMatch(playerScore: number, aiScore: number, isPlayerWinner: boolean, difficulty: string = 'easy'): Observable<MatchCreateResponse> {
    const matchData = {
      is_against_ai: true,
      ai_difficulty: difficulty,
      player1_score: playerScore,
      player2_score: aiScore,
      is_player1_winner: isPlayerWinner,
      match_type: 'local'
    };
    
    return this.http.post<MatchCreateResponse>(`${environment.apiUrl}/matches/create/`, matchData, {
      headers: this.getHeaders()
    });
  }
  
  /**
   * Crea un nuevo partido contra otro jugador
   */
  createHumanMatch(
    player2Username: string, 
    player1Score: number, 
    player2Score: number, 
    winnerUsername: string
  ): Observable<MatchCreateResponse> {
    const matchData = {
      is_against_ai: false,
      player1_score: player1Score,
      player2_score: player2Score,
      player2_username: player2Username,
      winner_username: winnerUsername,
      match_type: 'local'
    };
    
    return this.http.post<MatchCreateResponse>(`${environment.apiUrl}/matches/create/`, matchData, {
      headers: this.getHeaders()
    });
  }
  
  /**
   * Obtiene el historial de partidas de un usuario
   * Ahora incluirá los usernames en la respuesta
   */
  getMatchHistory(username: string): Observable<MatchHistoryResponse> {
    return this.http.get<MatchHistoryResponse>(`${environment.apiUrl}/matches/history/${username}/`, {
      headers: this.getHeaders()
    });
  }
}