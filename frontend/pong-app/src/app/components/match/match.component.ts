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
  playerCount: number = 2; // Para Pong básico, siempre 2 jugadores
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
    if (mode === '1v1') {
      this.isAgainstAI = false;
      this.showPlayerSelection = true;
    } else if (mode === 'AI') {
      this.isAgainstAI = true;
      this.startGameWithAI();
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
      
      // Si ya tenemos 2 jugadores, estamos listos para jugar
      if (this.selectedPlayers.length === 2) {
        console.log('Jugadores seleccionados:', this.selectedPlayers);
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
    if (this.selectedPlayers.length === 2) {
      this.gameStarted = true;
      // Simular un juego para fines de demostración
      this.simulateHumanGame();
    }
  }
  
  simulateHumanGame(): void {
    // Simulación muy simple de un juego
    setTimeout(() => {
      // Random result
      this.player1Score = Math.floor(Math.random() * 5) + 3;
      this.player2Score = Math.floor(Math.random() * 5);
      this.gameEnded = true;
      
      // Determinar ganador
      const player1Won = this.player1Score > this.player2Score;
      this.saveGameResult(player1Won);
    }, 3000);
  }
  
  saveGameResult(isPlayer1Winner: boolean): void {
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
      // Partida contra otro jugador
      const player2Username = this.selectedPlayers[1].username;
      const winnerUsername = isPlayer1Winner 
        ? this.currentUser?.username 
        : player2Username;
        
      if (winnerUsername) {
        this.matchService.createHumanMatch(
          player2Username,
          this.player1Score,
          this.player2Score,
          winnerUsername
        ).subscribe({
          next: (response) => {
            console.log('Partido guardado correctamente:', response);
            // Mostrar resultado final
            alert(`¡Juego terminado! Resultado: ${this.player1Score} - ${this.player2Score}`);
            this.resetGame();
          },
          error: (error) => {
            console.error('Error al guardar el partido:', error);
            alert('Error al guardar el resultado del partido');
          }
        });
      }
    }
  }
  
  resetGame(): void {
    this.gameStarted = false;
    this.gameEnded = false;
    this.player1Score = 0;
    this.player2Score = 0;
    this.showGameModes = false;
    this.showPlayerSelection = false;
    this.selectedMode = '';
    this.isAgainstAI = false;
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