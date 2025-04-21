import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatchService } from '../../services/match.service';
import { of, from, Observable, throwError } from 'rxjs';
import { catchError, delay, finalize, map, switchMap, tap } from 'rxjs/operators';

interface User {
  id: number;
  username: string;
  avatar?: string;
  is_online: boolean;
}

interface TournamentMatch {
  player1: User;
  player2: User;
  winner?: User;
  player1Score: number;
  player2Score: number;
}

// Cola de solicitudes para guardar partidos
class MatchSaveQueue {
  private queue: Array<{ 
    match: TournamentMatch, 
    round: 'semifinals1' | 'semifinals2' | 'final',
    onSuccess?: () => void,
    onError?: (error: any) => void 
  }> = [];
  private processing = false;

  constructor(private matchService: MatchService) {}

  // Añadir un partido a la cola
  add(match: TournamentMatch, round: 'semifinals1' | 'semifinals2' | 'final', onSuccess?: () => void, onError?: (error: any) => void): void {
    this.queue.push({ match, round, onSuccess, onError });
    if (!this.processing) {
      this.processNext();
    }
  }

  // Procesar el siguiente partido en la cola
  private processNext(): void {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { match, round, onSuccess, onError } = this.queue.shift()!;

    // Validar los datos antes de enviar
    if (!this.validateMatch(match)) {
      console.error('Datos de partido inválidos:', match);
      if (onError) onError(new Error('Datos de partido inválidos'));
      this.processNext();
      return;
    }

    // Procesar según la misma lógica de saveMatchResult
    const isPlayer1Winner = match.player1Score > match.player2Score;
    const winner = isPlayer1Winner ? match.player1 : match.player2;

    // CAMBIO AQUÍ: Cambiamos match_type de 'local' a 'tournament'
    const matchData: any = {
      is_against_ai: false,
      match_type: 'tournament', // Cambiado de 'local' a 'tournament'
      tournament_round: round,
      player1_username: match.player1.username,
      player2_username: match.player2.username,
      player1_score: match.player1Score,
      player2_score: match.player2Score,
      winner_username: winner.username
    };

    if (round === 'final') {
      matchData.is_tournament_final = true;
    }

    console.log(`TORNEO - Guardando partido desde la cola (${round}):`, matchData);

    // Guardar en el backend con sistema de reintentos
    let attempts = 0;
    const maxAttempts = 3;
    
    const attemptSave = () => {
      attempts++;
      console.log(`Intento ${attempts} de guardar partido (${round})`);
      
      this.matchService.createMultiplayerMatch(matchData).pipe(
        catchError(error => {
          console.error(`Error en intento ${attempts} de guardar partido (${round}):`, error);
          if (attempts < maxAttempts) {
            console.log(`Reintentando en 3 segundos...`);
            return of(null).pipe(
              delay(3000),
              switchMap(() => throwError(error))
            );
          }
          return throwError(error);
        }),
        finalize(() => {
          // Esperar 8 segundos entre partidos para evitar sobrecarga del servidor
          setTimeout(() => {
            if (onSuccess) onSuccess();
            this.processNext();
          }, 8000);
        })
      ).subscribe({
        next: (response) => {
          console.log(`Partido de torneo (${round}) guardado correctamente (intento ${attempts}):`, response);
        },
        error: (error) => {
          console.error(`Error al guardar partido de torneo (${round}) después de ${attempts} intentos:`, error);
          console.error('Datos enviados:', matchData);
          if (onError) onError(error);
        }
      });
    };

    attemptSave();
  }

  // Validar que el partido tenga todos los datos necesarios
  private validateMatch(match: TournamentMatch): boolean {
    // Verificar que ambos jugadores existan y tengan username e id
    if (!match.player1 || !match.player2 || 
        !match.player1.username || !match.player2.username ||
        !match.player1.id || !match.player2.id) {
      return false;
    }

    // Verificar que los puntajes sean números positivos
    if (typeof match.player1Score !== 'number' || typeof match.player2Score !== 'number' ||
        match.player1Score < 0 || match.player2Score < 0) {
      return false;
    }

    // Verificar que no haya empate
    if (match.player1Score === match.player2Score) {
      return false;
    }

    return true;
  }

  // Vaciar la cola (útil al resetear el juego)
  clear(): void {
    this.queue = [];
    this.processing = false;
  }
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
  
  // Propiedades para torneo
  isTournament: boolean = false;
  tournamentRound: 'semifinals1' | 'semifinals2' | 'final' = 'semifinals1';
  tournamentMatches: TournamentMatch[] = [];
  currentMatch: TournamentMatch | null = null;
  showAnnouncement: boolean = false;
  announcementMessage: string = '';
  tournamentWinner: User | null = null;
  
  // Cola de guardado de partidos
  private saveQueue: MatchSaveQueue;
  
  constructor(
    private matchService: MatchService,
    private router: Router
  ) {
    this.saveQueue = new MatchSaveQueue(matchService);
  }
  
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
        this.isTournament = false;
        this.showPlayerSelection = true;
        break;
      case '1v1v1':
        this.playerCount = 3;
        this.isAgainstAI = false;
        this.isTournament = false;
        this.showPlayerSelection = true;
        break;
      case '1v1v1v1':
        this.playerCount = 4;
        this.isAgainstAI = false;
        this.isTournament = false;
        this.showPlayerSelection = true;
        break;
      case 'AI':
        this.isAgainstAI = true;
        this.isTournament = false;
        this.startGameWithAI();
        break;
      case 'tournament':
        this.playerCount = 4;
        this.isAgainstAI = false;
        this.isTournament = true;
        this.tournamentRound = 'semifinals1';
        this.showPlayerSelection = true;
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
      
      if (this.isTournament) {
        this.startTournament();
      } else {
        // Simular un juego para fines de demostración
        this.simulateMultiplayerGame();
      }
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
  
  startTournament(): void {
    if (this.selectedPlayers.length !== 4) {
      alert('Se necesitan exactamente 4 jugadores para el torneo');
      return;
    }
    
    // Limpiar cola de guardado y datos antiguos
    this.saveQueue.clear();
    this.tournamentMatches = [];
    this.tournamentRound = 'semifinals1';
    
    // Anunciar primera semifinal
    this.showAnnouncementBeforeMatch(
      `1er combate: ${this.selectedPlayers[0].username} vs ${this.selectedPlayers[1].username}`,
      () => this.playTournamentMatch(0, 1, 'semifinals1')
    );
  }
  
  playTournamentMatch(player1Index: number, player2Index: number, round: 'semifinals1' | 'semifinals2' | 'final'): void {
    // Verificación adicional para asegurarnos de que los índices son válidos
    if (player1Index < 0 || player1Index >= this.selectedPlayers.length || 
        player2Index < 0 || player2Index >= this.selectedPlayers.length) {
      console.error('Índices de jugadores inválidos:', { player1Index, player2Index });
      this.resetGame();
      return;
    }
    
    // Configurar combate actual - creamos copias profundas para evitar problemas de referencia
    try {
      this.currentMatch = {
        player1: { ...this.selectedPlayers[player1Index] },
        player2: { ...this.selectedPlayers[player2Index] },
        player1Score: 0,
        player2Score: 0
      };
      
      this.tournamentRound = round;
      this.simulateTournamentMatch();
    } catch (error) {
      console.error('Error al configurar partido:', error);
      this.resetGame();
    }
  }
  
  simulateTournamentMatch(): void {
    if (!this.currentMatch) {
      console.error('No hay partido actual configurado');
      return;
    }
    
    // Simular resultado del combate
    setTimeout(() => {
      try {
        // Generar puntajes aleatorios para ambos jugadores (asegurando que no haya empate)
        let score1, score2;
        do {
          score1 = Math.floor(Math.random() * 7) + 1;
          score2 = Math.floor(Math.random() * 7) + 1;
        } while (score1 === score2);
        
        // Actualizar el currentMatch con los resultados
        this.currentMatch!.player1Score = score1;
        this.currentMatch!.player2Score = score2;
        
        // Determinar ganador
        const isPlayer1Winner = score1 > score2;
        const winner = isPlayer1Winner ? this.currentMatch!.player1 : this.currentMatch!.player2;
        this.currentMatch!.winner = winner;
        
        console.log(`Partido ${this.tournamentRound} finalizado:`, {
          player1: this.currentMatch!.player1.username,
          player2: this.currentMatch!.player2.username,
          score1: score1,
          score2: score2,
          winner: winner.username
        });
        
        // Crear una copia del partido completado
        const completedMatch: TournamentMatch = {
          player1: { ...this.currentMatch!.player1 },
          player2: { ...this.currentMatch!.player2 },
          player1Score: this.currentMatch!.player1Score,
          player2Score: this.currentMatch!.player2Score,
          winner: { ...winner }
        };
        
        // Añadir a la lista de partidos del torneo
        this.tournamentMatches.push(completedMatch);
        const currentRound = this.tournamentRound;
        
        // Determinamos el siguiente paso según la ronda usando la cola de guardado
        if (currentRound === 'semifinals1') {
          this.saveQueue.add(
            completedMatch, 
            currentRound,
            // Callback de éxito - pasamos a la siguiente ronda
            () => {
              this.showAnnouncementBeforeMatch(
                `2do combate: ${this.selectedPlayers[2].username} vs ${this.selectedPlayers[3].username}`,
                () => this.playTournamentMatch(2, 3, 'semifinals2')
              );
            },
            // Callback de error - continuamos de todas formas
            (error) => {
              console.error('Error en guardado de semifinal 1, continuando con el torneo:', error);
              this.showAnnouncementBeforeMatch(
                `2do combate: ${this.selectedPlayers[2].username} vs ${this.selectedPlayers[3].username}`,
                () => this.playTournamentMatch(2, 3, 'semifinals2')
              );
            }
          );
        } else if (currentRound === 'semifinals2') {
          this.saveQueue.add(
            completedMatch, 
            currentRound,
            // Callback de éxito - pasamos a la final
            () => {
              try {
                // Verificamos que tengamos ganadores para ambas semifinales
                if (this.tournamentMatches.length < 2 || 
                    !this.tournamentMatches[0].winner || 
                    !this.tournamentMatches[1].winner) {
                  throw new Error('Faltan ganadores de las semifinales');
                }
                
                const finalista1 = this.tournamentMatches[0].winner!;
                const finalista2 = this.tournamentMatches[1].winner!;
                
                this.showAnnouncementBeforeMatch(
                  `¡FINAL DEL TORNEO: ${finalista1.username} vs ${finalista2.username}!`,
                  () => {
                    // Encontrar índices de los finalistas
                    const index1 = this.selectedPlayers.findIndex(p => p.id === finalista1.id);
                    const index2 = this.selectedPlayers.findIndex(p => p.id === finalista2.id);
                    
                    if (index1 === -1 || index2 === -1) {
                      throw new Error('No se encontraron los finalistas en la lista de jugadores');
                    }
                    
                    this.playTournamentMatch(index1, index2, 'final');
                  }
                );
              } catch (error) {
                console.error('Error preparando la final:', error);
                this.resetGame();
              }
            },
            // Callback de error - intentamos continuar de todas formas
            (error) => {
              console.error('Error en guardado de semifinal 2, intentando continuar con la final:', error);
              try {
                if (this.tournamentMatches.length < 2) {
                  throw new Error('No hay suficientes partidos para la final');
                }
                
                // Usamos ganadores o jugadores originales si no hay ganadores
                const finalista1 = this.tournamentMatches[0].winner || this.tournamentMatches[0].player1;
                const finalista2 = this.tournamentMatches[1].winner || this.tournamentMatches[1].player1;
                
                this.showAnnouncementBeforeMatch(
                  `¡FINAL DEL TORNEO: ${finalista1.username} vs ${finalista2.username}!`,
                  () => {
                    const index1 = this.selectedPlayers.findIndex(p => p.id === finalista1.id);
                    const index2 = this.selectedPlayers.findIndex(p => p.id === finalista2.id);
                    
                    if (index1 >= 0 && index2 >= 0) {
                      this.playTournamentMatch(index1, index2, 'final');
                    } else {
                      this.resetGame();
                    }
                  }
                );
              } catch (error) {
                console.error('No se pudo recuperar de error en semifinal 2:', error);
                this.resetGame();
              }
            }
          );
        } else if (currentRound === 'final') {
          // El torneo ha terminado
          this.tournamentWinner = winner;
          
          this.saveQueue.add(
            completedMatch, 
            currentRound,
            // Callback de éxito - mostramos ganador y terminamos
            () => {
              this.showAnnouncementBeforeMatch(
                `¡${this.tournamentWinner?.username || 'Error'} es el CAMPEÓN del torneo!`,
                () => {
                  // Finalizar torneo
                  this.gameEnded = true;
                }
              );
            },
            // Callback de error - terminamos de todas formas
            (error) => {
              console.error('Error en guardado de la final:', error);
              this.showAnnouncementBeforeMatch(
                `¡${this.tournamentWinner?.username || 'Error'} es el CAMPEÓN del torneo!`,
                () => {
                  this.gameEnded = true;
                }
              );
            }
          );
        }
      } catch (error) {
        console.error('Error en simulateTournamentMatch:', error);
        this.resetGame();
      }
    }, 3000); // Simular que el juego dura 3 segundos
  }
  
  showAnnouncementBeforeMatch(message: string, callback: () => void): void {
    this.announcementMessage = message;
    this.showAnnouncement = true;
    
    // Mostrar anuncio durante 3 segundos y luego iniciar el combate
    setTimeout(() => {
      this.showAnnouncement = false;
      // Ejecutar callback después de que desaparezca el anuncio
      setTimeout(callback, 500);
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
    // Limpiar cola de guardado
    this.saveQueue.clear();
    
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
    this.isTournament = false;
    this.tournamentRound = 'semifinals1';
    this.tournamentMatches = [];
    this.currentMatch = null;
    this.tournamentWinner = null;
    
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