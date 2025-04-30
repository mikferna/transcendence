import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatchService } from '../../services/match.service';

interface User {
  id: number;
  username: string;
  avatar?: string;
  is_online: boolean;
}

interface TournamentMatch {
  round: number;     // 1=semifinal, 2=final
  matchNumber: number; // 1 o 2 para semifinales, 1 para final
  player1: User | null;
  player2: User | null;
  winner: User | null;
  player1Score: number;
  player2Score: number;
  completed: boolean;
}

@Component({
  selector: 'app-tournament',
  templateUrl: './tournament.component.html',
  styleUrls: ['./tournament.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TournamentComponent implements OnInit {
  // Estados de UI
  showPlayerSelection: boolean = true;
  showTournament: boolean = false;
  tournamentInProgress: boolean = false;
  currentMatchIndex: number = -1;
  showMatchComponent: boolean = false;
  
  // Datos de usuario
  currentUser: User | null = null;
  selectedPlayers: User[] = [];
  searchQuery: string = '';
  searchResults: User[] = [];
  isLoading: boolean = false;
  
  // Datos del torneo
  tournamentName: string = '';
  tournamentMatches: TournamentMatch[] = [];

  // Datos de la partida actual
  currentMatchPlayer1: User | null = null;
  currentMatchPlayer2: User | null = null;

  // Añadimos estas tres propiedades:
  currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
  currentTexts: any;
  translations: any = {
    es: {
      tournamentTitle: 'Torneo de Pong',
      selectFourPlayers: 'Selecciona 4 jugadores para comenzar el torneo',
      tournamentNameLabel: 'Nombre del Torneo:',
      tournamentNamePlaceholder: 'Nombre del torneo',
      selectedPlayers: 'Jugadores seleccionados',
      searchPlayers: 'Buscar jugadores',
      searchUsersPlaceholder: 'Buscar usuarios...',
      noUsersFound: 'No se encontraron usuarios',
      searching: 'Buscando...',
      play_match: 'Jugar Partida',
      startTournament: 'Iniciar Torneo',
      semifinals: 'Semifinales',
      final: 'Final',
      abandonTournament: 'Abandonar Torneo',
      newTournament: 'Nuevo Torneo',
      matchInProgress: 'Partido en curso',
      simulateMatch: 'Simular partida',
      matchNote: 'Nota: En la implementación final, aquí se mostraría el componente real de partida.',
      tournament_end: '¡El torneo ha finalizado! Ganador:',
      tournament_needs_4_players: 'Se necesitan exactamente 4 jugadores para iniciar el torneo',
      tournament_of_user: 'Torneo de',
      semifinals_not_completed: 'Error: no se han completado las semifinales',
      game_no_match_assigned: 'Error: la partida no tiene jugadores asignados',
      abandon_current_tournament: '¿Seguro que quieres abandonar el torneo en curso?'  
    },
    eus: {
      tournamentTitle: 'Pong Txapelketa',
      selectFourPlayers: 'Aukeratu 4 jokalari txapelketa hasteko',
      tournamentNameLabel: 'Txapelketaren izena:',
      tournamentNamePlaceholder: 'Txapelketaren izena',
      selectedPlayers: 'Aukeratutako jokalariak',
      searchPlayers: 'Jokalariak bilatu',
      searchUsersPlaceholder: 'Bilatu erabiltzaileak...',
      noUsersFound: 'Ez da erabiltzailerik aurkitu',
      searching: 'Bilatzen...',
      play_match: 'Partida jokatu',
      startTournament: 'Txapelketa hasi',
      semifinals: 'Finalerdiak',
      final: 'Finala',
      abandonTournament: 'Txapelketa utzi',
      newTournament: 'Txapelketa berria',
      matchInProgress: 'Partida martxan',
      simulateMatch: 'Partida simulatu',
      matchNote: 'Oharra: Azken bertsioan, hemen benetako partida osagaia agertuko litzateke.',
      tournament_end: 'Txapelketa amaitu da! Irabazlea:',
      tournament_needs_4_players: '4 jokalari behar dira txapelketa hasteko',
      tournament_of_user: 'Txapelketa:',
      semifinals_not_completed: 'Errorea: finalerdiak ez dira amaitu',
      game_no_match_assigned: 'Errorea: partidak ez du jokalariak esleituak',
      abandon_current_tournament: 'Ziur zaude uneko txapelketa utzi nahi duzula?'
    },
    en: {
      tournamentTitle: 'Pong Tournament',
      selectFourPlayers: 'Select 4 players to start the tournament',
      tournamentNameLabel: 'Tournament Name:',
      tournamentNamePlaceholder: 'Tournament name',
      selectedPlayers: 'Selected Players',
      searchPlayers: 'Search Players',
      searchUsersPlaceholder: 'Search users...',
      noUsersFound: 'No users found',
      searching: 'Searching...',
      play_match: 'Play Match',
      startTournament: 'Start Tournament',
      semifinals: 'Semifinals',
      final: 'Final',
      abandonTournament: 'Leave Tournament',
      newTournament: 'New Tournament',
      matchInProgress: 'Match In Progress',
      simulateMatch: 'Simulate Match',
      matchNote: 'Note: In the final implementation, the real match component would be shown here.',
      tournament_end: '¡The tournament is ove! Winner:',
      tournament_needs_4_players: 'Exactly 4 players are needed to start the tournament',
      tournament_of_user: 'Tournament of',
      semifinals_not_completed: 'Error: the semifinals have not been completed',
      game_no_match_assigned: 'Error: the match has no players assigned',
      no_users_assigned_to_match: 'Error: the match has no players assigned',
      error_saving_match_result: 'Error saving match result',
      abandon_current_tournament: 'Are you sure you want to abandon the current tournament?',      
    }
  };

  constructor(
    private matchService: MatchService,
    private router: Router
  ) {}
  
  ngOnInit(): void {
    this.getCurrentUser();
    
    // Verificar si hay un torneo guardado en localStorage
    this.loadTournamentState();

    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);
  
  }
  
  getCurrentUser(): void {
    this.matchService.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUser = user;
        if (this.currentUser) {
          this.selectedPlayers = [this.currentUser];
        }
      },
      error: (error) => {
        console.error('Error al obtener el usuario actual:', error);
      }
    });
  }
  
  searchUsers(): void {
    if (this.searchQuery.trim() === '') {
      this.searchResults = [];
      return;
    }
    
    this.isLoading = true;
    
    this.matchService.searchUsers(this.searchQuery).subscribe({
      next: (users) => {
        // Filtrar para excluir al usuario actual y a los jugadores ya seleccionados
        this.searchResults = users.filter(user => 
          user.id !== this.currentUser?.id && 
          !this.selectedPlayers.some(player => player.id === user.id)
        );
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error al buscar usuarios:', error);
        this.isLoading = false;
      }
    });
  }
  
  selectPlayer(player: User): void {
    if (this.selectedPlayers.length < 4) {
      this.selectedPlayers.push(player);
      this.searchQuery = '';
      this.searchResults = [];
      
      // Si ya tenemos 4 jugadores, estamos listos para el torneo
      if (this.selectedPlayers.length === 4) {
        console.log('Jugadores seleccionados para el torneo:', this.selectedPlayers);
      }
    }
  }
  
  removePlayer(player: User): void {
    if (player.id !== this.currentUser?.id) {
      this.selectedPlayers = this.selectedPlayers.filter(p => p.id !== player.id);
    }
  }
  
  initTournament(): void {
    if (this.selectedPlayers.length !== 4) {
      alert(this.currentTexts.tournament_needs_4_players);
      return;
    }
    
    if (!this.tournamentName.trim()) {
      this.tournamentName = this.currentTexts.tournament_of_user + ' ' + (this.currentUser?.username || '');
    }
    
    // Crear estructura del torneo con los jugadores
    this.tournamentMatches = [
      // Semifinales
      {
        round: 1,
        matchNumber: 1,
        player1: this.selectedPlayers[0],
        player2: this.selectedPlayers[1],
        winner: null,
        player1Score: 0,
        player2Score: 0,
        completed: false
      },
      {
        round: 1,
        matchNumber: 2,
        player1: this.selectedPlayers[2],
        player2: this.selectedPlayers[3],
        winner: null,
        player1Score: 0,
        player2Score: 0,
        completed: false
      },
      // Final (aún no tiene jugadores)
      {
        round: 2,
        matchNumber: 1,
        player1: null,
        player2: null,
        winner: null,
        player1Score: 0,
        player2Score: 0,
        completed: false
      }
    ];
    
    this.showPlayerSelection = false;
    this.showTournament = true;
    this.tournamentInProgress = true;
    
    // Guardar estado del torneo
    this.saveTournamentState();
    
    // Iniciar la primera partida
    this.startNextMatch();
  }
  
  startNextMatch(): void {
    // Buscar la siguiente partida por jugar
    const nextMatchIndex = this.tournamentMatches.findIndex(match => !match.completed);
    
    if (nextMatchIndex >= 0) {
      this.currentMatchIndex = nextMatchIndex;
      const currentMatch = this.tournamentMatches[nextMatchIndex];
      
      // Si es la final, asignar los ganadores de las semifinales
      if (currentMatch.round === 2) {
        const semifinal1 = this.tournamentMatches[0];
        const semifinal2 = this.tournamentMatches[1];
        
        if (semifinal1.winner && semifinal2.winner) {
          currentMatch.player1 = semifinal1.winner;
          currentMatch.player2 = semifinal2.winner;
          this.saveTournamentState();
        } else {
          alert(this.currentTexts.semifinals_not_completed);
          return;
        }
      }
      
      // Preparar datos para el componente match
      this.currentMatchPlayer1 = currentMatch.player1;
      this.currentMatchPlayer2 = currentMatch.player2;
      
      console.log(`Iniciando partida: Ronda ${currentMatch.round}, Match ${currentMatch.matchNumber}`);
      console.log('Jugadores:', this.currentMatchPlayer1?.username, 'vs', this.currentMatchPlayer2?.username);
      
      // Mostrar componente match
      this.showMatchComponent = true;
    } else {
      // Todas las partidas completadas, torneo finalizado
      this.tournamentInProgress = false;
      const winner = this.tournamentMatches[2].winner;
      alert(this.translations[this.currentLanguage].tournament_end + ' ' + (winner?.username || ''));
      this.saveTournamentState();
    }
  }
  
  simulateMatch(): void {
    if (this.currentMatchIndex < 0) return;
    
    const currentMatch = this.tournamentMatches[this.currentMatchIndex];
    
    if (!currentMatch.player1 || !currentMatch.player2) {
      alert(this.translations[this.currentLanguage].game_no_match_assigned);
      return;
    }
    
    // Simular resultado
    currentMatch.player1Score = Math.floor(Math.random() * 5) + 1;
    currentMatch.player2Score = Math.floor(Math.random() * 5) + 1;
    
    // Asegurar que haya un ganador (no empates)
    while (currentMatch.player1Score === currentMatch.player2Score) {
      currentMatch.player2Score = Math.floor(Math.random() * 5) + 1;
    }
    
    // Determinar ganador
    if (currentMatch.player1Score > currentMatch.player2Score) {
      currentMatch.winner = currentMatch.player1;
    } else {
      currentMatch.winner = currentMatch.player2;
    }
    
    // Guardar resultado en el backend
    this.saveMatchResult(
      currentMatch.player1, 
      currentMatch.player2, 
      currentMatch.player1Score, 
      currentMatch.player2Score,
      currentMatch.winner
    );
    
    // Marcar como completada
    currentMatch.completed = true;
    this.saveTournamentState();
    
    // Ocultar componente match 
    this.showMatchComponent = false;
    
    // Pasar a la siguiente partida
    setTimeout(() => {
      this.startNextMatch();
    }, 1000);
  }
  
  // Esto sería llamado desde el componente match cuando termina una partida
  finishMatch(player1Score: number, player2Score: number): void {
    if (this.currentMatchIndex < 0) return;
    
    const currentMatch = this.tournamentMatches[this.currentMatchIndex];
    
    if (!currentMatch.player1 || !currentMatch.player2) {
      alert(this.translations[this.currentLanguage].no_users_assigned_to_match);
      return;
    }
    
    // Asignar puntajes
    currentMatch.player1Score = player1Score;
    currentMatch.player2Score = player2Score;
    
    // Determinar ganador
    if (player1Score > player2Score) {
      currentMatch.winner = currentMatch.player1;
    } else {
      currentMatch.winner = currentMatch.player2;
    }
    
    // Marcar como completada
    currentMatch.completed = true;
    this.saveTournamentState();
    
    // Ocultar componente match
    this.showMatchComponent = false;
    
    // Pasar a la siguiente partida
    setTimeout(() => {
      this.startNextMatch();
    }, 1000);
  }
  
  saveMatchResult(player1: User, player2: User, player1Score: number, player2Score: number, winner: User): void {
    const matchData = {
      match_type: 'local', // Guardar como partida normal 1v1
      player2_username: player2.username,
      player1_score: player1Score,
      player2_score: player2Score,
      winner_username: winner.username
    };
    
    this.matchService.createMultiplayerMatch(matchData).subscribe({
      next: (response) => {
        console.log('Partido guardado correctamente:', response);
      },
      error: (error) => {
        console.error('Error al guardar el partido:', error);
        alert(this.translations[this.currentLanguage].error_saving_match_result);
      }
    });
  }
  
  resetTournament(): void {
    if (this.tournamentInProgress) {
      if (!confirm(this.translations[this.currentLanguage].abandon_current_tournament)) {
        return;
      }
    }
    
    this.showPlayerSelection = true;
    this.showTournament = false;
    this.tournamentInProgress = false;
    this.currentMatchIndex = -1;
    this.tournamentMatches = [];
    this.tournamentName = '';
    this.showMatchComponent = false;
    
    // Limpiar localStorage
    localStorage.removeItem('tournamentState');
    
    // Mantener solo al usuario actual en la lista
    if (this.currentUser) {
      this.selectedPlayers = [this.currentUser];
    } else {
      this.selectedPlayers = [];
    }
  }
  
  // Guardar estado del torneo en localStorage
  saveTournamentState(): void {
    const state = {
      tournamentName: this.tournamentName,
      tournamentMatches: this.tournamentMatches,
      selectedPlayers: this.selectedPlayers,
      showPlayerSelection: this.showPlayerSelection,
      showTournament: this.showTournament,
      tournamentInProgress: this.tournamentInProgress,
      currentMatchIndex: this.currentMatchIndex
    };
    
    try {
      localStorage.setItem('tournamentState', JSON.stringify(state));
    } catch (e) {
      console.error('Error guardando estado del torneo:', e);
    }
  }
  
  // Cargar estado del torneo desde localStorage
  loadTournamentState(): void {
    try {
      const stateJson = localStorage.getItem('tournamentState');
      
      if (stateJson) {
        const state = JSON.parse(stateJson);
        
        this.tournamentName = state.tournamentName;
        this.tournamentMatches = state.tournamentMatches;
        this.selectedPlayers = state.selectedPlayers;
        this.showPlayerSelection = state.showPlayerSelection;
        this.showTournament = state.showTournament;
        this.tournamentInProgress = state.tournamentInProgress;
        this.currentMatchIndex = state.currentMatchIndex;
        
        console.log('Estado del torneo cargado:', state);
      }
    } catch (e) {
      console.error('Error cargando estado del torneo:', e);
    }
  }
  
  // Para ser utilizado por el componente match
  onMatchFinished(event: {player1Score: number, player2Score: number}): void {
    this.finishMatch(event.player1Score, event.player2Score);
  }
}