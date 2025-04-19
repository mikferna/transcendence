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

@Component({
  selector: 'app-match',
  templateUrl: './match.component.html',
  styleUrls: ['./match.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class MatchComponent implements OnInit {
  // Estados de UI
  showGameModes: boolean = false;
  showPlayerSelection: boolean = false;
  
  // Configuración del juego
  selectedMode: string = '';
  playerCount: number = 2; // Valor predeterminado que ahora puede cambiar
  isAgainstAI: boolean = false;
  aiDifficulty: string = 'easy';
  
  // Datos de usuario
  currentUser: User | null = null;
  selectedPlayers: User[] = [];
  searchQuery: string = '';
  searchResults: User[] = [];
  isLoading: boolean = false;
  
  // Estado del juego
  gameStarted: boolean = false;
  gameEnded: boolean = false;
  player1Score: number = 0;
  player2Score: number = 0;
  player3Score: number = 0;
  player4Score: number = 0;
  
  constructor(
    private matchService: MatchService,
    private router: Router
  ) {}
  
  ngOnInit(): void {
    this.getCurrentUser();
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
  
  playGame(): void {
    this.showGameModes = true;
  }
  
  selectGameMode(mode: string): void {
    this.selectedMode = mode;
    
    switch (mode) {
      case '1v1':
        this.playerCount = 2;
        this.isAgainstAI = false;
        this.showPlayerSelection = true;
        break;
      case '1v1v1':
        this.playerCount = 3;
        this.isAgainstAI = false;
        this.showPlayerSelection = true;
        break;
      case '1v1v1v1':
        this.playerCount = 4;
        this.isAgainstAI = false;
        this.showPlayerSelection = true;
        break;
      case 'AI':
        this.isAgainstAI = true;
        this.startGameWithAI();
        break;
    }
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
    if (this.selectedPlayers.length < this.playerCount) {
      this.selectedPlayers.push(player);
      this.searchQuery = '';
      this.searchResults = [];
      
      // Si ya tenemos todos los jugadores necesarios, estamos listos para jugar
      if (this.selectedPlayers.length === this.playerCount) {
        console.log(`Jugadores seleccionados (${this.selectedPlayers.length}):`, this.selectedPlayers);
      }
    }
  }
  
  removePlayer(player: User): void {
    if (player.id !== this.currentUser?.id) {
      this.selectedPlayers = this.selectedPlayers.filter(p => p.id !== player.id);
    }
  }
  
  startGameWithAI(): void {
    this.gameStarted = true;
    // Simular un juego contra la IA y terminar con algún resultado
    this.simulateAIGame();
  }
  
  simulateAIGame(): void {
    // Simulación muy simple de un juego
    setTimeout(() => {
      // El jugador gana con score 5-3 (simplemente para tener datos que enviar al backend)
      this.player1Score = 5;
      this.player2Score = 3;
      this.gameEnded = true;
      
      // Guardar el resultado en el backend
      this.saveGameResult(true); // El jugador (player1) ganó
    }, 3000);
  }
  
  startGame(): void {
    if (this.selectedPlayers.length === this.playerCount) {
      this.gameStarted = true;
      // Simular un juego para fines de demostración
      this.simulateMultiplayerGame();
    }
  }
  
  simulateMultiplayerGame(): void {
    // Simulación simple pero ahora con soporte para más jugadores
    setTimeout(() => {
      // Generar puntajes aleatorios para todos los jugadores
      this.player1Score = Math.floor(Math.random() * 5) + 3;
      this.player2Score = Math.floor(Math.random() * 5);
      
      if (this.playerCount >= 3) {
        this.player3Score = Math.floor(Math.random() * 5);
      }
      
      if (this.playerCount >= 4) {
        this.player4Score = Math.floor(Math.random() * 5);
      }
      
      this.gameEnded = true;
      
      // Determinar ganador (el jugador con mayor puntaje)
      let maxScore = this.player1Score;
      let winnerIndex = 0;
      
      if (this.player2Score > maxScore) {
        maxScore = this.player2Score;
        winnerIndex = 1;
      }
      
      if (this.playerCount >= 3 && this.player3Score > maxScore) {
        maxScore = this.player3Score;
        winnerIndex = 2;
      }
      
      if (this.playerCount >= 4 && this.player4Score > maxScore) {
        maxScore = this.player4Score;
        winnerIndex = 3;
      }
      
      this.saveGameResult(winnerIndex === 0, winnerIndex);
    }, 3000);
  }
  
  saveGameResult(isPlayer1Winner: boolean, winnerIndex: number = 0): void {
    if (this.isAgainstAI) {
      this.matchService.createAIMatch(
        this.player1Score,
        this.player2Score,
        isPlayer1Winner,
        this.aiDifficulty
      ).subscribe({
        next: (response) => {
          console.log('Partido contra IA guardado correctamente:', response);
          // Mostrar resultado final
          alert(`¡Juego terminado! Resultado: ${this.player1Score} - ${this.player2Score}`);
          this.resetGame();
        },
        error: (error) => {
          console.error('Error al guardar el partido contra IA:', error);
          alert('Error al guardar el resultado del partido');
        }
      });
    } else {
      // Determinar el tipo de partido según el número de jugadores
      const matchType = this.playerCount === 2 ? 'local' : 
                        this.playerCount === 3 ? '3players' : '4players';
      
      // Determinar el ganador
      const winnerUsername = this.selectedPlayers[winnerIndex].username;
      
      // Preparar datos específicos según el tipo de partido
      let matchData: any = {
        match_type: matchType,
        winner_username: winnerUsername,
        player1_score: this.player1Score,
        player2_score: this.player2Score
      };
      
      // Añadir datos de los jugadores según el tipo de partido
      if (this.playerCount >= 2 && this.selectedPlayers.length > 1) {
        matchData.player2_username = this.selectedPlayers[1].username;
      }
      
      if (this.playerCount >= 3 && this.selectedPlayers.length > 2) {
        matchData.player3_username = this.selectedPlayers[2].username;
        matchData.player3_score = this.player3Score;
      }
      
      if (this.playerCount >= 4 && this.selectedPlayers.length > 3) {
        matchData.player4_username = this.selectedPlayers[3].username;
        matchData.player4_score = this.player4Score;
      }
      
      console.log('Enviando datos de la partida:', matchData);
      
      this.matchService.createMultiplayerMatch(matchData).subscribe({
        next: (response) => {
          console.log('Partido guardado correctamente:', response);
          
          // Construir mensaje de resultado según número de jugadores
          let resultText = `¡Juego terminado! Resultado: ${this.player1Score} - ${this.player2Score}`;
          
          if (this.playerCount >= 3) {
            resultText += ` - ${this.player3Score}`;
          }
          
          if (this.playerCount >= 4) {
            resultText += ` - ${this.player4Score}`;
          }
          
          alert(resultText);
          this.resetGame();
        },
        error: (error) => {
          console.error('Error al guardar el partido:', error);
          alert(`Error al guardar el resultado del partido: ${error.error?.error || 'Error interno del servidor'}`);
        }
      });
    }
  }
  
  resetGame(): void {
    this.gameStarted = false;
    this.gameEnded = false;
    this.player1Score = 0;
    this.player2Score = 0;
    this.player3Score = 0;
    this.player4Score = 0;
    this.showGameModes = false;
    this.showPlayerSelection = false;
    this.selectedMode = '';
    this.isAgainstAI = false;
    this.playerCount = 2; // Restablecer a valor predeterminado
    
    // Mantener solo al usuario actual en la lista
    if (this.currentUser) {
      this.selectedPlayers = [this.currentUser];
    } else {
      this.selectedPlayers = [];
    }
  }
  
  goBack(): void {
    if (this.gameStarted) {
      // Si estamos en un juego, preguntar si queremos salir
      if (confirm('¿Seguro que quieres abandonar el juego en curso?')) {
        this.resetGame();
      }
    } else if (this.showPlayerSelection) {
      this.showPlayerSelection = false;
    } else if (this.showGameModes) {
      this.showGameModes = false;
    }
  }
}