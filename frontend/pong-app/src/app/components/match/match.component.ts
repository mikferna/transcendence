import { Component, OnInit, ViewChild, ElementRef, NgZone, OnDestroy, HostListener, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatchService } from '../../services/match.service';
import { of, from, Observable, throwError, Subscription } from 'rxjs';
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

    const matchData: any = {
      is_against_ai: false,
      match_type: 'tournament',
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

// Interfaces para el juego Pong
interface PongGameState {
  running: boolean;
  paddleLeft: { x: number, y: number, width: number, height: number, dy: number };
  paddleRight: { x: number, y: number, width: number, height: number, dy: number };
  ball: { x: number, y: number, radius: number, dx: number, dy: number };
  canvas: { width: number, height: number };
  gameOver: boolean;
  winner: 'player1' | 'player2' | null;
  player1Score: number;
  player2Score: number;
  maxScore: number;
  isTournamentMatch: boolean;
  tournamentRound?: 'semifinals1' | 'semifinals2' | 'final';
}

@Component({
  selector: 'app-match',
  templateUrl: './match.component.html',
  styleUrls: ['./match.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class MatchComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('pongCanvas', { static: false }) pongCanvasRef!: ElementRef<HTMLCanvasElement>;
  
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
  
  // Propiedades para el juego Pong
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId!: number;
  private pongGame!: PongGameState;
  private keysPressed: Set<string> = new Set();
  private gameLoopSubscription?: Subscription;
  private pendingInitPong: boolean = false;
  private pendingPongConfig: {isAI: boolean, isTournament: boolean, tournamentRound?: 'semifinals1' | 'semifinals2' | 'final'} | null = null;
  
  constructor(
    private matchService: MatchService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.saveQueue = new MatchSaveQueue(matchService);
  }
  
  ngOnInit(): void {
    this.getCurrentUser();
  }
  
  ngAfterViewChecked(): void {
    // Inicializar el juego Pong si está pendiente y el canvas ya está disponible
    if (this.pendingInitPong && this.pongCanvasRef) {
      const config = this.pendingPongConfig!;
      this.pendingInitPong = false;
      this.pendingPongConfig = null;
      this.initPongGame(config.isAI, config.isTournament, config.tournamentRound);
    }
  }
  
  ngOnDestroy(): void {
    this.stopPongGame();
    if (this.gameLoopSubscription) {
      this.gameLoopSubscription.unsubscribe();
    }
  }
  
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.gameStarted || this.gameEnded || this.showAnnouncement) return;
    this.keysPressed.add(event.key.toLowerCase());
  }
  
  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.key.toLowerCase());
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
    
    // Usamos setTimeout para dar tiempo a que el canvas se haya renderizado
    setTimeout(() => {
      this.schedulePongInit(true, false);
    }, 300);
  }
  
  startGame(): void {
    if (this.selectedPlayers.length === this.playerCount) {
      this.gameStarted = true;
      
      if (this.isTournament) {
        this.startTournament();
      } else if (this.playerCount === 2) {
        // Usamos setTimeout para dar tiempo a que el canvas se haya renderizado
        setTimeout(() => {
          this.schedulePongInit(false, false);
        }, 300);
      } else {
        // Para modos de más de 2 jugadores, seguimos con la simulación
        this.simulateMultiplayerGame();
      }
    }
  }
  
  // Programar la inicialización del juego Pong para cuando el canvas esté disponible
  schedulePongInit(isAI: boolean, isTournament: boolean = false, tournamentRound?: 'semifinals1' | 'semifinals2' | 'final'): void {
    this.pendingInitPong = true;
    this.pendingPongConfig = { isAI, isTournament, tournamentRound };
    
    // Si el canvas ya está disponible, iniciar directamente
    if (this.pongCanvasRef) {
      this.pendingInitPong = false;
      this.pendingPongConfig = null;
      this.initPongGame(isAI, isTournament, tournamentRound);
    }
  }
  
  // Inicializar el juego Pong
  initPongGame(isAI: boolean, isTournament: boolean = false, tournamentRound?: 'semifinals1' | 'semifinals2' | 'final'): void {
    // Asegurarse de que el canvas está disponible
    if (!this.pongCanvasRef) {
      console.error('Canvas no disponible, reprogramando inicialización...');
      this.schedulePongInit(isAI, isTournament, tournamentRound);
      return;
    }
    
    try {
      const canvas = this.pongCanvasRef.nativeElement;
      this.ctx = canvas.getContext('2d')!;
      
      if (!this.ctx) {
        throw new Error('No se pudo obtener el contexto 2D del canvas');
      }
      
      // Ajustar el tamaño del canvas
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight || 300;
      }
      
      // Configuración inicial del juego
      const paddleHeight = 80;
      const paddleWidth = 12;
      const ballRadius = 8;
      
      this.pongGame = {
        running: true,
        gameOver: false,
        winner: null,
        player1Score: 0,
        player2Score: 0,
        maxScore: 5, // El primer jugador en llegar a 5 puntos gana
        paddleLeft: {
          x: 20,
          y: canvas.height / 2 - paddleHeight / 2,
          width: paddleWidth,
          height: paddleHeight,
          dy: 0
        },
        paddleRight: {
          x: canvas.width - 20 - paddleWidth,
          y: canvas.height / 2 - paddleHeight / 2,
          width: paddleWidth,
          height: paddleHeight,
          dy: 0
        },
        ball: {
          x: canvas.width / 2,
          y: canvas.height / 2,
          radius: ballRadius,
          dx: 5 * (Math.random() > 0.5 ? 1 : -1), // Dirección aleatoria
          dy: 3 * (Math.random() > 0.5 ? 1 : -1)  // Dirección aleatoria
        },
        canvas: {
          width: canvas.width,
          height: canvas.height
        },
        isTournamentMatch: isTournament,
        tournamentRound: tournamentRound
      };
      
      // Iniciar el bucle del juego
      this.ngZone.runOutsideAngular(() => {
        this.gameLoop(isAI);
      });
      
      console.log(`Juego Pong inicializado (${isTournament ? 'Torneo-' + tournamentRound : isAI ? 'VS-IA' : '1v1'})`);
    } catch (error) {
      console.error('Error al inicializar el juego Pong:', error);
      
      // Si es un partido de torneo, caemos a simulación para no bloquear el torneo
      if (isTournament && tournamentRound && this.currentMatch) {
        console.warn('Fallback a simulación para el partido de torneo');
        this.simulateTournamentMatch();
      } else if (isAI) {
        console.warn('Fallback a simulación para el partido contra IA');
        this.simulateAIGame();
      } else {
        console.warn('Fallback a simulación para el partido 1v1');
        this.simulateMultiplayerGame();
      }
    }
  }
  
  // Bucle principal del juego
  gameLoop(isAI: boolean): void {
    if (!this.pongGame || !this.pongGame.running) return;
    
    // Actualizar el estado del juego
    this.updatePongGame(isAI);
    
    // Dibujar el estado actual
    this.drawPongGame();
    
    // Comprobar si el juego ha terminado
    if (this.pongGame.gameOver) {
      this.finalizeGame();
      return;
    }
    
    // Continuar el bucle
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop(isAI));
  }
  
  // Actualizar la lógica del juego
  updatePongGame(isAI: boolean): void {
    const { paddleLeft, paddleRight, ball, canvas } = this.pongGame;
    
    // Mover la paleta izquierda (jugador humano)
    if (this.keysPressed.has('w')) {
      paddleLeft.y = Math.max(0, paddleLeft.y - 8);
    }
    if (this.keysPressed.has('s')) {
      paddleLeft.y = Math.min(canvas.height - paddleLeft.height, paddleLeft.y + 8);
    }
    
    // Mover la paleta derecha (segundo jugador o IA)
    if (isAI) {
      // Lógica de la IA para seguir la bola
      const aiSpeed = this.getAISpeed();
      const paddleCenter = paddleRight.y + paddleRight.height / 2;
      const ballDirection = ball.dx > 0 ? 1 : -0.3; // La IA es más agresiva cuando la bola va hacia ella
      
      if (ball.y > paddleCenter + 10) {
        paddleRight.y = Math.min(canvas.height - paddleRight.height, paddleRight.y + aiSpeed * ballDirection);
      } else if (ball.y < paddleCenter - 10) {
        paddleRight.y = Math.max(0, paddleRight.y - aiSpeed * ballDirection);
      }
    } else {
      // Control para el segundo jugador humano
      if (this.keysPressed.has('arrowup')) {
        paddleRight.y = Math.max(0, paddleRight.y - 8);
      }
      if (this.keysPressed.has('arrowdown')) {
        paddleRight.y = Math.min(canvas.height - paddleRight.height, paddleRight.y + 8);
      }
    }
    
    // Mover la bola
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    // Colisión con los bordes superior e inferior
    if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
      ball.dy = -ball.dy;
    }
    
    // Colisión con las paletas
    if (this.checkPaddleCollision(ball, paddleLeft) || 
        this.checkPaddleCollision(ball, paddleRight)) {
      // Invertir la dirección horizontal y aumentar ligeramente la velocidad
      ball.dx = -ball.dx * 1.05;
      
      // Añadir un poco de variación al rebote según donde golpee la bola en la paleta
      const hitPosition = this.lastCollisionPaddle === 'left' ? 
        (ball.y - (paddleLeft.y + paddleLeft.height / 2)) / (paddleLeft.height / 2) :
        (ball.y - (paddleRight.y + paddleRight.height / 2)) / (paddleRight.height / 2);
      
      ball.dy = hitPosition * 6; // Factor de ángulo del rebote
    }
    
    // Punto para el jugador 2 (derecha)
    if (ball.x - ball.radius < 0) {
      this.pongGame.player2Score++;
      this.resetBall();
      // Actualizar puntuación en el componente
      this.ngZone.run(() => {
        this.player2Score = this.pongGame.player2Score;
        if (this.currentMatch) {
          this.currentMatch.player2Score = this.pongGame.player2Score;
        }
      });
    }
    
    // Punto para el jugador 1 (izquierda)
    if (ball.x + ball.radius > canvas.width) {
      this.pongGame.player1Score++;
      this.resetBall();
      // Actualizar puntuación en el componente
      this.ngZone.run(() => {
        this.player1Score = this.pongGame.player1Score;
        if (this.currentMatch) {
          this.currentMatch.player1Score = this.pongGame.player1Score;
        }
      });
    }
    
    // Comprobar fin del juego
    if (this.pongGame.player1Score >= this.pongGame.maxScore) {
      this.pongGame.gameOver = true;
      this.pongGame.winner = 'player1';
    } else if (this.pongGame.player2Score >= this.pongGame.maxScore) {
      this.pongGame.gameOver = true;
      this.pongGame.winner = 'player2';
    }
  }
  
  // Variable para almacenar la última paleta con la que colisionó la bola
  private lastCollisionPaddle: 'left' | 'right' | null = null;
  
  // Verificar colisión con una paleta
  checkPaddleCollision(ball: any, paddle: any): boolean {
    if (ball.x + ball.radius > paddle.x && 
        ball.x - ball.radius < paddle.x + paddle.width && 
        ball.y + ball.radius > paddle.y && 
        ball.y - ball.radius < paddle.y + paddle.height) {
      
      // Registrar qué paleta fue golpeada
      this.lastCollisionPaddle = paddle === this.pongGame.paddleLeft ? 'left' : 'right';
      return true;
    }
    return false;
  }
  
  // Reiniciar la posición de la bola después de un punto
  resetBall(): void {
    const { ball, canvas } = this.pongGame;
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.dx = 5 * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = 3 * (Math.random() > 0.5 ? 1 : -1);
  }
  
  // Obtener la velocidad de la IA según la dificultad
  getAISpeed(): number {
    switch (this.aiDifficulty) {
      case 'easy': return 4;
      case 'medium': return 6;
      case 'hard': return 8;
      default: return 5;
    }
  }
  
  // Dibujar el estado actual del juego
  drawPongGame(): void {
    if (!this.ctx || !this.pongGame) return;
    
    const { paddleLeft, paddleRight, ball, canvas } = this.pongGame;
    
    // Limpiar el canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar fondo
    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar línea central
    this.ctx.beginPath();
    this.ctx.setLineDash([5, 5]);
    this.ctx.moveTo(canvas.width / 2, 0);
    this.ctx.lineTo(canvas.width / 2, canvas.height);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Dibujar paletas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(paddleLeft.x, paddleLeft.y, paddleLeft.width, paddleLeft.height);
    this.ctx.fillRect(paddleRight.x, paddleRight.y, paddleRight.width, paddleRight.height);
    
    // Dibujar bola
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#4CAF50';
    this.ctx.fill();
    this.ctx.closePath();
    
    // Dibujar puntuación
    this.ctx.font = '32px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(this.pongGame.player1Score.toString(), canvas.width / 4, 50);
    this.ctx.fillText(this.pongGame.player2Score.toString(), (canvas.width / 4) * 3, 50);
    
    // Si es un partido de torneo, mostrar información adicional
    if (this.pongGame.isTournamentMatch && this.pongGame.tournamentRound) {
      this.ctx.font = '18px Arial';
      this.ctx.fillStyle = '#2196F3';
      
      let roundText = '';
      switch (this.pongGame.tournamentRound) {
        case 'semifinals1': roundText = '1ª Semifinal'; break;
        case 'semifinals2': roundText = '2ª Semifinal'; break;
        case 'final': roundText = 'Final del Torneo'; break;
      }
      
      this.ctx.fillText(roundText, canvas.width / 2, 20);
    }
    
    // Mensaje de game over si es necesario
    if (this.pongGame.gameOver) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      this.ctx.font = 'bold 48px Arial';
      this.ctx.fillStyle = '#4CAF50';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('¡JUEGO TERMINADO!', canvas.width / 2, canvas.height / 2 - 24);
      
      this.ctx.font = '32px Arial';
      this.ctx.fillStyle = '#ffffff';
      
      let winner = '';
      if (this.pongGame.isTournamentMatch && this.currentMatch) {
        winner = this.pongGame.winner === 'player1' ? 
          this.currentMatch.player1.username : 
          this.currentMatch.player2.username;
      } else {
        winner = this.pongGame.winner === 'player1' ? 
          (this.selectedPlayers[0]?.username || 'Jugador 1') : 
          (this.isAgainstAI ? 'IA' : this.selectedPlayers[1]?.username || 'Jugador 2');
      }
      
      this.ctx.fillText(`Ganador: ${winner}`, canvas.width / 2, canvas.height / 2 + 24);
    }
  }
  
  // Detener el juego
  stopPongGame(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    if (this.pongGame) {
      this.pongGame.running = false;
    }
  }
  
  // Finalizar el juego y guardar resultados
  finalizeGame(): void {
    this.stopPongGame();
    
    // Actualizar estado en la zona de Angular
    this.ngZone.run(() => {
      // Actualizar puntuaciones del componente
      this.player1Score = this.pongGame.player1Score;
      this.player2Score = this.pongGame.player2Score;
      
      if (this.pongGame.isTournamentMatch && this.currentMatch && this.pongGame.tournamentRound) {
        // Es un partido de torneo
        this.finalizeTournamentMatch();
      } else {
        // Es una partida normal
        this.gameEnded = true;
        
        // Guardar resultado en el backend
        const isPlayer1Winner = this.pongGame.winner === 'player1';
        this.saveGameResult(isPlayer1Winner);
      }
    });
  }
  
  // Finalizar un partido de torneo
  finalizeTournamentMatch(): void {
    if (!this.currentMatch || !this.pongGame.tournamentRound) return;
    
    // Actualizar el currentMatch con los resultados
    this.currentMatch.player1Score = this.pongGame.player1Score;
    this.currentMatch.player2Score = this.pongGame.player2Score;
    
    // Determinar ganador
    const isPlayer1Winner = this.pongGame.winner === 'player1';
    const winner = isPlayer1Winner ? this.currentMatch.player1 : this.currentMatch.player2;
    this.currentMatch.winner = winner;
    
    console.log(`Partido ${this.tournamentRound} finalizado:`, {
      player1: this.currentMatch.player1.username,
      player2: this.currentMatch.player2.username,
      score1: this.currentMatch.player1Score,
      score2: this.currentMatch.player2Score,
      winner: winner.username
    });
    
    // Crear una copia del partido completado
    const completedMatch: TournamentMatch = {
      player1: { ...this.currentMatch.player1 },
      player2: { ...this.currentMatch.player2 },
      player1Score: this.currentMatch.player1Score,
      player2Score: this.currentMatch.player2Score,
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
  }
  
  // Métodos de simulación para usar como fallback
  simulateAIGame(): void {
    setTimeout(() => {
      this.player1Score = Math.floor(Math.random() * 3) + 3; // 3-5
      this.player2Score = Math.floor(Math.random() * 3);     // 0-2
      this.gameEnded = true;
      
      const isPlayer1Winner = this.player1Score > this.player2Score;
      this.saveGameResult(isPlayer1Winner);
    }, 3000);
  }
  
  simulateMultiplayerGame(): void {
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
      
      // Usar la implementación real de Pong para el torneo en lugar de simulación
      setTimeout(() => {
        this.schedulePongInit(false, true, round);
      }, 300);
      
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
        this.player1Score = score1;
        this.player2Score = score2;
        
        // Determinar ganador
        const isPlayer1Winner = score1 > score2;
        const winner = isPlayer1Winner ? this.currentMatch!.player1 : this.currentMatch!.player2;
        this.currentMatch!.winner = winner;
        
        // El resto de la lógica es igual a finalizeTournamentMatch()
        console.log(`Partido ${this.tournamentRound} finalizado (simulado):`, {
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
        
        // Continuar con el torneo según la ronda actual
        this.processTournamentNext(completedMatch);
      } catch (error) {
        console.error('Error en simulateTournamentMatch:', error);
        this.resetGame();
      }
    }, 3000);
  }
  
  // Procesar siguiente paso del torneo (código común entre simulación y juego real)
  private processTournamentNext(completedMatch: TournamentMatch): void {
    const currentRound = this.tournamentRound;
    
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
      // Lógica para pasar a la final (igual que en finalizeTournamentMatch)
      // ...
    } else if (currentRound === 'final') {
      // Lógica para finalizar el torneo (igual que en finalizeTournamentMatch)
      // ...
    }
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
    
    // Detener juego Pong si está en ejecución
    this.stopPongGame();
    
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