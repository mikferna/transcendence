import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MatchService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getCurrentUser(): Observable<any> {
    return this.http.get(`${this.apiUrl}/current-user/`);
  }

  searchUsers(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/search/?query=${query}`);
  }

  createAIMatch(
    player1Score: number,
    player2Score: number,
    isPlayer1Winner: boolean,
    aiDifficulty: string
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/matches/create/`, {
      is_against_ai: true,
      player1_score: player1Score,
      player2_score: player2Score,
      is_player1_winner: isPlayer1Winner,
      ai_difficulty: aiDifficulty,
      match_type: 'ai'
    });
  }

  createHumanMatch(
    player2Username: string,
    player1Score: number,
    player2Score: number,
    winnerUsername: string
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/matches/create/`, {
      is_against_ai: false,
      player2_username: player2Username,
      player1_score: player1Score,
      player2_score: player2Score,
      winner_username: winnerUsername,
      match_type: 'local'
    });
  }

  // Método para partidas multijugador
  createMultiplayerMatch(matchData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/matches/create/`, {
      is_against_ai: false,
      ...matchData
    });
  }

  // Nuevo método para torneo
  createTournamentMatch(tournamentData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/tournaments/create/`, {
      ...tournamentData
    });
  }
}