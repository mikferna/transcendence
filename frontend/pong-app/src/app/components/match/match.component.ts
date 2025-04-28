import { Component, OnInit, ViewChild, ElementRef, NgZone, OnDestroy, HostListener, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatchService } from '../../services/match.service';
import { of, throwError, Subscription } from 'rxjs';
import { catchError, delay, finalize, switchMap } from 'rxjs/operators';

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
  powerUp?: {
    active: boolean;
    x: number;
    y: number;
    radius: number;
    type: string;
  }
}

interface Pong4PlayersGameState {
  running: boolean;
  paddles: {
    left: { x: number, y: number, width: number, height: number, dy: number, player: User },
    right: { x: number, y: number, width: number, height: number, dy: number, player: User },
    top: { x: number, y: number, width: number, height: number, dx: number, player: User },
    bottom: { x: number, y: number, width: number, height: number, dx: number, player: User }
  };
  ball: { x: number, y: number, radius: number, dx: number, dy: number };
  canvas: { width: number, height: number };
  scores: { [playerId: number]: number };
  maxScore: number;
  gameOver: boolean;
  winner: User | null;
  lastTouched: User | null;
  powerUp?: {
    active: boolean;
    x: number;
    y: number;
    radius: number;
    type: string;
  }
}

class MatchSaveQueue {
  private queue: Array<{ 
    match: TournamentMatch, 
    round: 'semifinals1' | 'semifinals2' | 'final',
    onSuccess?: () => void,
    onError?: (error: any) => void 
  }> = [];
  private processing = false;

  constructor(private matchService: MatchService) {}

  add(match: TournamentMatch, round: 'semifinals1' | 'semifinals2' | 'final', onSuccess?: () => void, onError?: (error: any) => void): void {
    this.queue.push({ match, round, onSuccess, onError });
    if (!this.processing) {
      this.processNext();
    }
  }

  private processNext(): void {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { match, round, onSuccess, onError } = this.queue.shift()!;

    if (!this.validateMatch(match)) {
      console.error('Datos de partido inválidos:', match);
      if (onError) onError(new Error('Datos de partido inválidos'));
      this.processNext();
      return;
    }

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
              switchMap(() => throwError(() => error))
            );
          }
          return throwError(() => error);
        }),
        finalize(() => {
          setTimeout(() => {
            if (onSuccess) onSuccess();
            this.processNext();
          }, 3000);
        })
      ).subscribe({
        next: (response) => {
          console.log(`Partido de torneo (${round}) guardado correctamente:`, response);
        },
        error: (error) => {
          console.error(`Error al guardar partido de torneo (${round}):`, error);
          if (onError) onError(error);
        }
      });
    };

    attemptSave();
  }

  private validateMatch(match: TournamentMatch): boolean {
    if (!match.player1 || !match.player2 || 
        !match.player1.username || !match.player2.username ||
        !match.player1.id || !match.player2.id) {
      return false;
    }

    if (typeof match.player1Score !== 'number' || typeof match.player2Score !== 'number' ||
        match.player1Score < 0 || match.player2Score < 0) {
      return false;
    }

    if (match.player1Score === match.player2Score) {
      return false;
    }

    return true;
  }

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
export class MatchComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('pongCanvas', { static: false }) pongCanvasRef!: ElementRef<HTMLCanvasElement>;
  
  showGameModes: boolean = false;
  showPlayerSelection: boolean = false;
  showConfig: boolean = false;
  isInitialLoading: boolean = true;
  
  selectedMode: string = '';
  playerCount: number = 2;
  isAgainstAI: boolean = false;
  
  currentUser: User | null = null;
  selectedPlayers: User[] = [];
  searchQuery: string = '';
  searchResults: User[] = [];
  isLoading: boolean = false;
  
  gameStarted: boolean = false;
  gameEnded: boolean = false;
  player1Score: number = 0;
  player2Score: number = 0;
  player3Score: number = 0;
  player4Score: number = 0;
  
  // Configuración del juego
  gameConfig: {
    ballSpeed: number;
    ballSize: number;
    paddleSize: number;
    enablePowerUps: boolean;
    theme: 'default' | 'blue-matrix' | 'red-matrix';
    aiDifficulty: 'easy' | 'medium' | 'hard';
  } = {
    ballSpeed: 5,
    ballSize: 8,
    paddleSize: 80,
    enablePowerUps: true,
    theme: 'default',
    aiDifficulty: 'medium'
  };
  
  // Power-ups
  powerUpTypes = [
    { type: 'giant-paddle', name: 'Paleta Grande', duration: 10000 },
    { type: 'mini-paddle', name: 'Paleta Pequeña', duration: 10000 },
    { type: 'fast-ball', name: 'Bola Rápida', duration: 8000 },
    { type: 'inverted-controls', name: 'Controles Invertidos', duration: 6000 }
  ];
  activePowerUps: Array<{
    type: string,
    name: string,
    duration: number,
    remainingTime: number
  }> = [];
  
  // IA mejorada
  lastAIUpdate: number = 0;
  aiUpdateInterval: number = 1000; // 1 segundo
  aiPredictedBallPosition: { x: number, y: number } = { x: 0, y: 0 };
  controlsInverted: boolean = false;
  
  isTournament: boolean = false;
  tournamentRound: 'semifinals1' | 'semifinals2' | 'final' = 'semifinals1';
  tournamentMatches: TournamentMatch[] = [];
  currentMatch: TournamentMatch | null = null;
  showAnnouncement: boolean = false;
  announcementMessage: string = '';
  tournamentWinner: User | null = null;
  
  private saveQueue: MatchSaveQueue;
  
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId!: number;
  private pongGame!: PongGameState;
  private pong4PlayersGame!: Pong4PlayersGameState;
  private keysPressed: Set<string> = new Set();
  private gameLoopSubscription?: Subscription;
  private pendingInitPong: boolean = false;
  private pendingPongConfig: {isAI: boolean, isTournament: boolean, tournamentRound?: 'semifinals1' | 'semifinals2' | 'final'} | null = null;
  
// Añadimos estas tres propiedades:
currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
currentTexts: any;
translations: any = {
  es: {
    initialicing_system: 'Iniciando Sistema...',
    defy_other_users: 'Desafía a otros jugadores en línea',
    start_game: 'INICIAR JUEGO',
    choose_mode: 'SELECCIONAR MODO',
    choose_game_mode: 'Elige tu modo de juego',
    one_vs_one_game: 'JUEGO 1 VS 1',
    four_players_game: 'JUEGO 4 JUGADORES',
    game_vs_computer: 'JUEGO VS COMPUTADORA',
    four_player_tornament: 'TORNEO (4 JUGADORES)',
    configuration: 'CONFIGURACIÓN',
    go_back: 'VOLVER',
    choose_players: 'SELECCIONAR JUGADORES',
    required: 'Se requieren ',
    to_play: ' jugadores para iniciar',
    required_four_player_for_tournament: 'Se requieren 4 jugadores para el torneo',
    chosed_players: 'JUGADORES SELECCIONADOS ',
    search_players: 'BUSCAR JUGADORES',
    search_by_username: 'BUSCAR POR NOMBRE DE USUARIO',
    searching_players: 'BUSCANDO JUGADORES...',
    no_players_found: 'NO SE ENCONTRARON USUARIOS',
    cancel: 'CANCELAR',
    game_parameters: 'INICIAR JUEGO',
    ball_speed: 'Velocidad de la bola:',
    ball_size: 'Tamaño de la bola',
    paddle_size: 'Tamaño de la paleta:',
    enable_power_ups: 'Habilitar power-ups:',
    ai_difficulty: 'Dificultad de la IA',
    easy: 'Fácil',
    medium: 'Media',
    hard: 'Difícil',
    theme: 'TEMA VISUAL',
    green: 'Verde',
    blue: 'Azul',
    red: 'Rojo',
    save: 'GUARDAR',
    semifinal_one: 'SEMIFINAL 1',
    semifinal_two: 'SEMIFINAL 2',
    tournament_end: 'FINAL DEL TORNEO',
    game_on: 'PARTIDA EN PROGRESO',
    vs: 'VS',
    computer: 'COMPUTADORA',
    tournament_ended: 'TORNEO FINALIZADO',
    winner: 'CAMPEÓN',
    matches_history: 'HISTORIAL DE PARTIDOS:',
    control_two_players: 'CONTROLES: Jugador 1 [W/S] - Jugador 2 [↑/↓]',
    controls_ai: 'CONTROLES: Usa [W/S] para mover la paleta',
    controls: 'CONTROLES:',
    player_left: 'Jugador 1 (izquierda): [W/S]',
    palyer_right: 'Jugador 2 (derecha): [↑/↓]',
    palyer_up: 'Jugador 3 (arriba): [A/D]',
    palyer_down: 'Jugador 4 (abajo): [J/L]',
    exit: 'SALIR',
    confirm_abandon_game: '¿Seguro que quieres abandonar el juego en curso?'
  },
  en: {
    initialicing_system: 'Initializing System...',
    defy_other_users: 'Challenge other players online',
    start_game: 'START GAME',
    choose_mode: 'SELECT MODE',
    choose_game_mode: 'Choose your game mode',
    one_vs_one_game: '1 VS 1 GAME',
    four_players_game: '4 PLAYERS GAME',
    game_vs_computer: 'GAME VS COMPUTER',
    four_player_tornament: 'TOURNAMENT (4 PLAYERS)',
    configuration: 'CONFIGURATION',
    go_back: 'GO BACK',
    choose_players: 'SELECT PLAYERS',
    required: 'Required ',
    to_play: ' players to start',
    required_four_player_for_tournament: '4 players required for the tournament',
    chosed_players: 'SELECTED PLAYERS ',
    search_players: 'SEARCH PLAYERS',
    search_by_username: 'SEARCH PLAYER BY USERNAME',
    searching_players: 'SEARCHING PLAYERS...',
    no_players_found: 'NO PLAYERS FOUND',
    cancel: 'CANCEL',
    game_parameters: 'START GAME',
    ball_speed: 'Ball speed:',
    ball_size: 'Ball size:',
    paddle_size: 'Paddle size:',
    enable_power_ups: 'Enable power-ups:',
    ai_difficulty: 'AI Difficulty',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    theme: 'VISUAL THEME',
    green: 'Green',
    blue: 'Blue',
    red: 'Red',
    save: 'SAVE',
    semifinal_one: 'SEMIFINAL 1',
    semifinal_two: 'SEMIFINAL 2',
    tournament_end: 'TOURNAMENT FINAL',
    game_on: 'GAME IN PROGRESS',
    vs: 'VS',
    computer: 'COMPUTER',
    tournament_ended: 'TOURNAMENT ENDED',
    winner: 'CHAMPION',
    matches_history: 'MATCHES HISTORY:',
    control_two_players: 'CONTROLS: Player 1 [W/S] - Player 2 [↑/↓]',
    controls_ai: 'CONTROLS: Use [W/S] to move the paddle',
    controls: 'CONTROLS:',
    player_left: 'Player 1 (left): [W/S]',
    palyer_right: 'Player 2 (right): [↑/↓]',
    palyer_up: 'Player 3 (top): [A/D]',
    palyer_down: 'Player 4 (bottom): [J/L]',
    exit: 'EXIT',
    confirm_abandon_game: 'Are you sure you want to abandon the current game?'
  }
};



  constructor(
    private matchService: MatchService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.saveQueue = new MatchSaveQueue(matchService);
  }
  
  ngOnInit(): void {
    // Simular tiempo de carga
    document.body.classList.add('loading-active');
    
    setTimeout(() => {
      this.isInitialLoading = false;
      document.body.classList.remove('loading-active');
      this.getCurrentUser();
    }, 2000);
    
    // Cargar configuración guardada si existe
    const savedConfig = localStorage.getItem('pongGameConfig');
    if (savedConfig) {
      try {
        this.gameConfig = JSON.parse(savedConfig);
      } catch (e) {
        console.error('Error al cargar la configuración:', e);
      }
    }

    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);
  }
  
  toggleConfig(): void {
    this.showConfig = !this.showConfig;
  }
  
  saveConfig(): void {
    // Guardar la configuración en localStorage para futuras sesiones
    localStorage.setItem('pongGameConfig', JSON.stringify(this.gameConfig));
    this.showConfig = false;
  }
  
  ngAfterViewChecked(): void {
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
    }
  }
  
  removePlayer(player: User): void {
    if (player.id !== this.currentUser?.id) {
      this.selectedPlayers = this.selectedPlayers.filter(p => p.id !== player.id);
    }
  }
  
  startGameWithAI(): void {
    this.gameStarted = true;
    
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
        setTimeout(() => {
          this.schedulePongInit(false, false);
        }, 300);
      } else if (this.playerCount === 4) {
        setTimeout(() => {
          this.initPong4PlayersGame();
        }, 300);
      }
    }
  }
  
  schedulePongInit(isAI: boolean, isTournament: boolean = false, tournamentRound?: 'semifinals1' | 'semifinals2' | 'final'): void {
    this.pendingInitPong = true;
    this.pendingPongConfig = { isAI, isTournament, tournamentRound };
    
    if (this.pongCanvasRef) {
      this.pendingInitPong = false;
      this.pendingPongConfig = null;
      this.initPongGame(isAI, isTournament, tournamentRound);
    }
  }
  
  initPongGame(isAI: boolean, isTournament: boolean = false, tournamentRound?: 'semifinals1' | 'semifinals2' | 'final'): void {
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
      
      const container = canvas.parentElement;
      if (container) {
        // Ajustamos el tamaño para que sea visible completamente
        canvas.width = Math.min(800, container.clientWidth - 20);
        canvas.height = Math.min(500, window.innerHeight * 0.6);
      }
      
      // Usar valores de configuración
      const paddleHeight = this.gameConfig.paddleSize;
      const paddleWidth = 12;
      const ballRadius = this.gameConfig.ballSize;
      
      this.pongGame = {
        running: true,
        gameOver: false,
        winner: null,
        player1Score: 0,
        player2Score: 0,
        maxScore: 5,
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
          dx: this.gameConfig.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
          dy: (this.gameConfig.ballSpeed * 0.6) * (Math.random() > 0.5 ? 1 : -1)
        },
        canvas: {
          width: canvas.width,
          height: canvas.height
        },
        isTournamentMatch: isTournament,
        tournamentRound: tournamentRound,
        powerUp: {
          active: false,
          x: canvas.width / 2,
          y: canvas.height / 2,
          radius: 15,
          type: this.getRandomPowerUpType()
        }
      };
      
      // Inicializar la IA
      if (isAI) {
        this.lastAIUpdate = Date.now();
        this.aiPredictedBallPosition = { 
          x: this.pongGame.ball.x, 
          y: this.pongGame.ball.y 
        };
      }
      
      // Crear power-up inicial en el centro si están habilitados
      if (this.gameConfig.enablePowerUps) {
        this.activePowerUps = [];
        this.spawnCenterPowerUp();
      }
      
      this.ngZone.runOutsideAngular(() => {
        this.gameLoop(isAI);
      });
      
      console.log(`Juego Pong inicializado (${isTournament ? 'Torneo-' + tournamentRound : isAI ? 'VS-IA' : '1v1'})`);
    } catch (error) {
      console.error('Error al inicializar el juego Pong:', error);
      
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
  
  getRandomPowerUpType(): string {
    return this.powerUpTypes[Math.floor(Math.random() * this.powerUpTypes.length)].type;
  }
  
  spawnCenterPowerUp(): void {
    if (!this.gameConfig.enablePowerUps || !this.pongGame || this.pongGame.gameOver) return;
    
    // Activar un power-up en el centro del campo
    this.pongGame.powerUp = {
      active: true,
      x: this.pongGame.canvas.width / 2,
      y: this.pongGame.canvas.height / 2,
      radius: 15,
      type: this.getRandomPowerUpType()
    };
  }
  
  applyPowerUpEffect(type: string): void {
    if (!this.pongGame) return;
    
    // Seleccionar un power-up aleatorio si no se especificó
    if (!type) {
      type = this.getRandomPowerUpType();
    }
    
    // Buscar la definición del power-up
    const powerUpDef = this.powerUpTypes.find(p => p.type === type);
    if (!powerUpDef) return;
    
    // Añadir power-up a la lista de activos
    this.activePowerUps.push({
      type: powerUpDef.type,
      name: powerUpDef.name,
      duration: powerUpDef.duration,
      remainingTime: powerUpDef.duration
    });
    
    // Aplicar efectos según el tipo
    switch (type) {
      case 'giant-paddle':
        this.pongGame.paddleLeft.height = this.gameConfig.paddleSize * 1.5;
        this.pongGame.paddleRight.height = this.gameConfig.paddleSize * 1.5;
        break;
      case 'mini-paddle':
        this.pongGame.paddleLeft.height = this.gameConfig.paddleSize * 0.6;
        this.pongGame.paddleRight.height = this.gameConfig.paddleSize * 0.6;
        break;
      case 'fast-ball':
        const speedMultiplier = 1.5;
        this.pongGame.ball.dx *= speedMultiplier;
        this.pongGame.ball.dy *= speedMultiplier;
        break;
      case 'inverted-controls':
        this.controlsInverted = true;
        break;
    }
    
    // Programar la finalización del power-up
    setTimeout(() => {
      this.endPowerUpEffect(type);
      this.activePowerUps = this.activePowerUps.filter(p => p.type !== type);
      
      // Volver a crear un power-up después de un tiempo
      setTimeout(() => {
        if (this.pongGame && this.pongGame.running && !this.pongGame.gameOver) {
          this.spawnCenterPowerUp();
        }
      }, 3000);
    }, powerUpDef.duration);
    
    console.log(`Power-up activado: ${powerUpDef.name}`);
  }
  
  endPowerUpEffect(type: string): void {
    if (!this.pongGame) return;
    
    switch (type) {
      case 'giant-paddle':
      case 'mini-paddle':
        this.pongGame.paddleLeft.height = this.gameConfig.paddleSize;
        this.pongGame.paddleRight.height = this.gameConfig.paddleSize;
        break;
      case 'fast-ball':
        // No reducir velocidad para mantener dificultad
        break;
      case 'inverted-controls':
        this.controlsInverted = false;
        break;
    }
    
    console.log(`Power-up finalizado: ${type}`);
  }
  
  updatePowerUpTimers(): void {
    const elapsed = 16; // ~16ms por frame a 60fps
    
    for (const powerUp of this.activePowerUps) {
      powerUp.remainingTime = Math.max(0, powerUp.remainingTime - elapsed);
    }
  }
  
  initPong4PlayersGame(): void {
    if (!this.pongCanvasRef) {
      console.error('Canvas no disponible, reprogramando inicialización...');
      setTimeout(() => this.initPong4PlayersGame(), 300);
      return;
    }
    
    try {
      const canvas = this.pongCanvasRef.nativeElement;
      this.ctx = canvas.getContext('2d')!;
      
      if (!this.ctx) {
        throw new Error('No se pudo obtener el contexto 2D del canvas');
      }
      
      const container = canvas.parentElement;
      if (container) {
        // Ajustamos el tamaño para que sea visible completamente
        canvas.width = Math.min(800, container.clientWidth - 20);
        canvas.height = Math.min(600, window.innerHeight * 0.6);
      }
      
      // Usar valores de configuración para paletas y bola
      const verticalPaddleHeight = this.gameConfig.paddleSize;
      const verticalPaddleWidth = 12;
      const horizontalPaddleHeight = 12;
      const horizontalPaddleWidth = this.gameConfig.paddleSize;
      const ballRadius = this.gameConfig.ballSize;
      
      if (this.selectedPlayers.length < 4) {
        throw new Error('Se necesitan 4 jugadores para este modo');
      }
      
      const initialScores: { [playerId: number]: number } = {};
      this.selectedPlayers.forEach(player => {
        initialScores[player.id] = 0;
      });
      
      this.pong4PlayersGame = {
        running: true,
        paddles: {
          left: {
            x: 20,
            y: canvas.height / 2 - verticalPaddleHeight / 2,
            width: verticalPaddleWidth,
            height: verticalPaddleHeight,
            dy: 0,
            player: this.selectedPlayers[0]
          },
          right: {
            x: canvas.width - 20 - verticalPaddleWidth,
            y: canvas.height / 2 - verticalPaddleHeight / 2,
            width: verticalPaddleWidth,
            height: verticalPaddleHeight,
            dy: 0,
            player: this.selectedPlayers[1]
          },
          top: {
            x: canvas.width / 2 - horizontalPaddleWidth / 2,
            y: 20,
            width: horizontalPaddleWidth,
            height: horizontalPaddleHeight,
            dx: 0,
            player: this.selectedPlayers[2]
          },
          bottom: {
            x: canvas.width / 2 - horizontalPaddleWidth / 2,
            y: canvas.height - 20 - horizontalPaddleHeight,
            width: horizontalPaddleWidth,
            height: horizontalPaddleHeight,
            dx: 0,
            player: this.selectedPlayers[3]
          }
        },
        ball: {
          x: canvas.width / 2,
          y: canvas.height / 2,
          radius: ballRadius,
          dx: this.gameConfig.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
          dy: this.gameConfig.ballSpeed * (Math.random() > 0.5 ? 1 : -1)
        },
        canvas: {
          width: canvas.width,
          height: canvas.height
        },
        scores: initialScores,
        maxScore: 5,
        gameOver: false,
        winner: null,
        lastTouched: null,
        powerUp: {
          active: this.gameConfig.enablePowerUps,
          x: canvas.width / 2,
          y: canvas.height / 2,
          radius: 15,
          type: this.getRandomPowerUpType()
        }
      };
      
      this.resetPlayersScores();
      
      this.ngZone.runOutsideAngular(() => {
        this.gameLoop4Players();
      });
      
      console.log('Juego 1v1v1v1 inicializado');
    } catch (error) {
      console.error('Error al inicializar el juego 1v1v1v1:', error);
      console.warn('Fallback a simulación para el modo 1v1v1v1');
      this.simulateMultiplayerGame();
    }
  }
  
  gameLoop(isAI: boolean): void {
    if (!this.pongGame || !this.pongGame.running) return;
    
    this.updatePongGame(isAI);
    this.drawPongGame();
    
    if (this.pongGame.gameOver) {
      this.finalizeGame();
      return;
    }
    
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop(isAI));
  }
  
  gameLoop4Players(): void {
    if (!this.pong4PlayersGame || !this.pong4PlayersGame.running) return;
    
    this.updatePong4PlayersGame();
    this.drawPong4PlayersGame();
    
    if (this.pong4PlayersGame.gameOver) {
      this.finalize4PlayersGame();
      return;
    }
    
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop4Players());
  }
  
  updatePongGame(isAI: boolean): void {
    const { paddleLeft, paddleRight, ball, canvas, powerUp } = this.pongGame;
    
    // Actualizar timers de power-ups
    if (this.gameConfig.enablePowerUps) {
      this.updatePowerUpTimers();
    }
    
    // Controles del jugador 1 (izquierda)
    const moveUp1 = this.controlsInverted ? 's' : 'w';
    const moveDown1 = this.controlsInverted ? 'w' : 's';
    
    if (this.keysPressed.has(moveUp1)) {
      paddleLeft.y = Math.max(0, paddleLeft.y - 8);
    }
    if (this.keysPressed.has(moveDown1)) {
      paddleLeft.y = Math.min(canvas.height - paddleLeft.height, paddleLeft.y + 8);
    }
    
    // IA o jugador 2 (derecha)
    if (isAI) {
      const now = Date.now();
      
      // Actualizar la predicción de la IA solo una vez por segundo
      if (now - this.lastAIUpdate >= this.aiUpdateInterval) {
        this.lastAIUpdate = now;
        this.predictBallPosition();
        
        // Simular pulsaciones de teclas en lugar de mover directamente
        this.simulateAIKeyPresses();
      }
    } else {
      // Controles del jugador 2 (derecha)
      const moveUp2 = this.controlsInverted ? 'arrowdown' : 'arrowup';
      const moveDown2 = this.controlsInverted ? 'arrowup' : 'arrowdown';
      
      if (this.keysPressed.has(moveUp2)) {
        paddleRight.y = Math.max(0, paddleRight.y - 8);
      }
      if (this.keysPressed.has(moveDown2)) {
        paddleRight.y = Math.min(canvas.height - paddleRight.height, paddleRight.y + 8);
      }
    }
    
    // Actualización de la física de la bola
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    // Colisiones con paredes superior e inferior
    if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
      ball.dy = -ball.dy;
    }
    
    // Colisiones con paletas
    if (this.checkPaddleCollision(ball, paddleLeft) || 
        this.checkPaddleCollision(ball, paddleRight)) {
      ball.dx = -ball.dx * 1.05;
      
      const hitPosition = this.lastCollisionPaddle === 'left' ? 
        (ball.y - (paddleLeft.y + paddleLeft.height / 2)) / (paddleLeft.height / 2) :
        (ball.y - (paddleRight.y + paddleRight.height / 2)) / (paddleRight.height / 2);
      
      ball.dy = hitPosition * 6;
    }
    
    // Manejo de puntuación
    if (ball.x - ball.radius < 0) {
      this.pongGame.player2Score++;
      this.resetBall();
      this.ngZone.run(() => {
        this.player2Score = this.pongGame.player2Score;
        if (this.currentMatch) {
          this.currentMatch.player2Score = this.pongGame.player2Score;
        }
      });
    }
    
    if (ball.x + ball.radius > canvas.width) {
      this.pongGame.player1Score++;
      this.resetBall();
      this.ngZone.run(() => {
        this.player1Score = this.pongGame.player1Score;
        if (this.currentMatch) {
          this.currentMatch.player1Score = this.pongGame.player1Score;
        }
      });
    }
    
    // Verificar colisión con power-up
    if (powerUp && powerUp.active) {
      const distance = Math.hypot(ball.x - powerUp.x, ball.y - powerUp.y);
      if (distance < (ball.radius + powerUp.radius)) {
        // Activar el power-up
        this.applyPowerUpEffect(powerUp.type);
        
        // Desactivar el power-up visual
        powerUp.active = false;
      }
    }
    
    // Verificar fin del juego
    if (this.pongGame.player1Score >= this.pongGame.maxScore) {
      this.pongGame.gameOver = true;
      this.pongGame.winner = 'player1';
    } else if (this.pongGame.player2Score >= this.pongGame.maxScore) {
      this.pongGame.gameOver = true;
      this.pongGame.winner = 'player2';
    }
  }
  
  simulateAIKeyPresses(): void {
    // Esta función simula las pulsaciones de teclas de la IA
    // en lugar de mover directamente la paleta
    if (!this.pongGame) return;
    
    const paddleCenter = this.pongGame.paddleRight.y + this.pongGame.paddleRight.height / 2;
    
    // Eliminar teclas anteriores (simulando soltar teclas)
    this.keysPressed.delete('arrowup');
    this.keysPressed.delete('arrowdown');
    
    // Determinar dirección basada en la predicción
    if (this.aiPredictedBallPosition.y > paddleCenter + 10) {
      // Simular presionar tecla abajo
      this.keysPressed.add('arrowdown');
    } else if (this.aiPredictedBallPosition.y < paddleCenter - 10) {
      // Simular presionar tecla arriba
      this.keysPressed.add('arrowup');
    }
  }
  
  predictBallPosition(): void {
    if (!this.pongGame) return;
    
    const { ball, canvas, paddleLeft, paddleRight } = this.pongGame;
    
    // Crear una copia de la bola para la simulación
    const simBall = { 
      x: ball.x, 
      y: ball.y, 
      dx: ball.dx, 
      dy: ball.dy, 
      radius: ball.radius 
    };
    
    // Predecir la trayectoria de la bola (máximo 50 pasos para evitar bucles infinitos)
    let iterations = 0;
    
    // Solo predecir si la bola se dirige hacia la paleta de la IA
    if (simBall.dx > 0) {
      while (simBall.x < paddleRight.x && iterations < 50) {
        simBall.x += simBall.dx;
        simBall.y += simBall.dy;
        
        // Simular rebotes en paredes
        if (simBall.y - simBall.radius < 0 || simBall.y + simBall.radius > canvas.height) {
          simBall.dy = -simBall.dy;
        }
        
        // Simular rebotes en paleta izquierda
        if (simBall.x - simBall.radius < paddleLeft.x + paddleLeft.width && 
            simBall.x + simBall.radius > paddleLeft.x &&
            simBall.y + simBall.radius > paddleLeft.y &&
            simBall.y - simBall.radius < paddleLeft.y + paddleLeft.height) {
          
          // Simular cambio de dirección y velocidad
          simBall.dx = -simBall.dx * 1.05;
          
          const hitPosition = (simBall.y - (paddleLeft.y + paddleLeft.height / 2)) / (paddleLeft.height / 2);
          simBall.dy = hitPosition * 6;
        }
        
        iterations++;
      }
      
      // Si la bola alcanza la pared derecha, predecir dónde estará
      if (iterations < 50) {
        this.aiPredictedBallPosition = { x: simBall.x, y: simBall.y };
      } else {
        // Si no podemos predecir, hacer un movimiento basado en la posición actual
        this.aiPredictedBallPosition = { 
          x: paddleRight.x, 
          y: Math.min(
            Math.max(ball.y, paddleRight.height / 2),
            canvas.height - paddleRight.height / 2
          )
        };
      }
    } else {
      // Si la bola va en dirección contraria, mantener la paleta en posición central
      this.aiPredictedBallPosition = { 
        x: paddleRight.x, 
        y: canvas.height / 2 
      };
    }
    
    // Añadir un poco de "error humano" a la predicción según la dificultad
    const errorMargin = this.getAIDifficultyErrorMargin();
    this.aiPredictedBallPosition.y += (Math.random() * 2 - 1) * errorMargin;
    
    // Asegurar que la predicción esté dentro de los límites del canvas
    this.aiPredictedBallPosition.y = Math.min(
      Math.max(this.aiPredictedBallPosition.y, 0),
      canvas.height
    );
  }
  
  getAIDifficultyErrorMargin(): number {
    switch (this.gameConfig.aiDifficulty) {
      case 'easy': return 40; // Gran margen de error
      case 'medium': return 20; // Error moderado
      case 'hard': return 5; // Error mínimo
      default: return 20;
    }
  }
  
  getAISpeed(): number {
    switch (this.gameConfig.aiDifficulty) {
      case 'easy': return 4;
      case 'medium': return 6;
      case 'hard': return 8;
      default: return 5;
    }
  }
  
  updatePong4PlayersGame(): void {
    const { paddles, ball, canvas, powerUp, scores } = this.pong4PlayersGame;
    
    if (this.keysPressed.has('w')) {
      paddles.left.y = Math.max(0, paddles.left.y - 6);
    }
    if (this.keysPressed.has('s')) {
      paddles.left.y = Math.min(canvas.height - paddles.left.height, paddles.left.y + 6);
    }
    
    if (this.keysPressed.has('arrowup')) {
      paddles.right.y = Math.max(0, paddles.right.y - 6);
    }
    if (this.keysPressed.has('arrowdown')) {
      paddles.right.y = Math.min(canvas.height - paddles.right.height, paddles.right.y + 6);
    }
    
    if (this.keysPressed.has('a')) {
      paddles.top.x = Math.max(0, paddles.top.x - 6);
    }
    if (this.keysPressed.has('d')) {
      paddles.top.x = Math.min(canvas.width - paddles.top.width, paddles.top.x + 6);
    }
    
    if (this.keysPressed.has('j')) {
      paddles.bottom.x = Math.max(0, paddles.bottom.x - 6);
    }
    if (this.keysPressed.has('l')) {
      paddles.bottom.x = Math.min(canvas.width - paddles.bottom.width, paddles.bottom.x + 6);
    }
    
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    this.checkPaddle4PlayersCollision();
    
    // Verificar colisión con power-up
    if (powerUp && powerUp.active) {
      const distance = Math.hypot(ball.x - powerUp.x, ball.y - powerUp.y);
      if (distance < (ball.radius + powerUp.radius)) {
        // Activar el power-up
        this.apply4PlayerPowerUpEffect(powerUp.type);
        
        // Desactivar el power-up visual
        powerUp.active = false;
      }
    }
    
    if (ball.x - ball.radius < 0) {
      if (this.pong4PlayersGame.lastTouched) {
        const playerId = this.pong4PlayersGame.lastTouched.id;
        scores[playerId]++;
        this.updatePlayerScore(this.pong4PlayersGame.lastTouched, scores[playerId]);
        this.checkGameOver();
      }
      this.resetBall4Players();
    } else if (ball.x + ball.radius > canvas.width) {
      if (this.pong4PlayersGame.lastTouched) {
        const playerId = this.pong4PlayersGame.lastTouched.id;
        scores[playerId]++;
        this.updatePlayerScore(this.pong4PlayersGame.lastTouched, scores[playerId]);
        this.checkGameOver();
      }
      this.resetBall4Players();
    } else if (ball.y - ball.radius < 0) {
      if (this.pong4PlayersGame.lastTouched) {
        const playerId = this.pong4PlayersGame.lastTouched.id;
        scores[playerId]++;
        this.updatePlayerScore(this.pong4PlayersGame.lastTouched, scores[playerId]);
        this.checkGameOver();
      }
      this.resetBall4Players();
    } else if (ball.y + ball.radius > canvas.height) {
      if (this.pong4PlayersGame.lastTouched) {
        const playerId = this.pong4PlayersGame.lastTouched.id;
        scores[playerId]++;
        this.updatePlayerScore(this.pong4PlayersGame.lastTouched, scores[playerId]);
        this.checkGameOver();
      }
      this.resetBall4Players();
    }
  }
  
  apply4PlayerPowerUpEffect(type: string): void {
    if (!this.pong4PlayersGame) return;
    
    // Añadir power-up a la lista de activos
    const powerUpDef = this.powerUpTypes.find(p => p.type === type);
    if (!powerUpDef) return;
    
    this.activePowerUps.push({
      type: powerUpDef.type,
      name: powerUpDef.name,
      duration: powerUpDef.duration,
      remainingTime: powerUpDef.duration
    });
    
    // Aplicar efectos según el tipo
    switch (type) {
      case 'giant-paddle':
        this.pong4PlayersGame.paddles.left.height = this.gameConfig.paddleSize * 1.5;
        this.pong4PlayersGame.paddles.right.height = this.gameConfig.paddleSize * 1.5;
        this.pong4PlayersGame.paddles.top.width = this.gameConfig.paddleSize * 1.5;
        this.pong4PlayersGame.paddles.bottom.width = this.gameConfig.paddleSize * 1.5;
        break;
      case 'mini-paddle':
        this.pong4PlayersGame.paddles.left.height = this.gameConfig.paddleSize * 0.6;
        this.pong4PlayersGame.paddles.right.height = this.gameConfig.paddleSize * 0.6;
        this.pong4PlayersGame.paddles.top.width = this.gameConfig.paddleSize * 0.6;
        this.pong4PlayersGame.paddles.bottom.width = this.gameConfig.paddleSize * 0.6;
        break;
      case 'fast-ball':
        const speedMultiplier = 1.5;
        this.pong4PlayersGame.ball.dx *= speedMultiplier;
        this.pong4PlayersGame.ball.dy *= speedMultiplier;
        break;
      case 'inverted-controls':
        this.controlsInverted = true;
        break;
    }
    
    // Programar la finalización del power-up
    setTimeout(() => {
      this.end4PlayerPowerUpEffect(type);
      this.activePowerUps = this.activePowerUps.filter(p => p.type !== type);
      
      // Volver a crear un power-up después de un tiempo
      setTimeout(() => {
        if (this.pong4PlayersGame && this.pong4PlayersGame.running && !this.pong4PlayersGame.gameOver) {
          this.spawn4PlayerCenterPowerUp();
        }
      }, 3000);
    }, powerUpDef.duration);
    
    console.log(`Power-up activado: ${powerUpDef.name}`);
  }
  
  end4PlayerPowerUpEffect(type: string): void {
    if (!this.pong4PlayersGame) return;
    
    switch (type) {
      case 'giant-paddle':
      case 'mini-paddle':
        this.pong4PlayersGame.paddles.left.height = this.gameConfig.paddleSize;
        this.pong4PlayersGame.paddles.right.height = this.gameConfig.paddleSize;
        this.pong4PlayersGame.paddles.top.width = this.gameConfig.paddleSize;
        this.pong4PlayersGame.paddles.bottom.width = this.gameConfig.paddleSize;
        break;
      case 'fast-ball':
        // No reducir velocidad para mantener dificultad
        break;
      case 'inverted-controls':
        this.controlsInverted = false;
        break;
    }
    
    console.log(`Power-up finalizado: ${type}`);
  }
  
  spawn4PlayerCenterPowerUp(): void {
    if (!this.gameConfig.enablePowerUps || !this.pong4PlayersGame || this.pong4PlayersGame.gameOver) return;
    
    // Activar un power-up en el centro del campo
    this.pong4PlayersGame.powerUp = {
      active: true,
      x: this.pong4PlayersGame.canvas.width / 2,
      y: this.pong4PlayersGame.canvas.height / 2,
      radius: 15,
      type: this.getRandomPowerUpType()
    };
  }
  
  private lastCollisionPaddle: 'left' | 'right' | null = null;
  
  checkPaddleCollision(ball: any, paddle: any): boolean {
    if (ball.x + ball.radius > paddle.x && 
        ball.x - ball.radius < paddle.x + paddle.width && 
        ball.y + ball.radius > paddle.y && 
        ball.y - ball.radius < paddle.y + paddle.height) {
      
      this.lastCollisionPaddle = paddle === this.pongGame.paddleLeft ? 'left' : 'right';
      return true;
    }
    return false;
  }
  
  checkPaddle4PlayersCollision(): void {
    const { paddles, ball } = this.pong4PlayersGame;
    
    if (ball.x - ball.radius < paddles.left.x + paddles.left.width &&
        ball.x + ball.radius > paddles.left.x &&
        ball.y + ball.radius > paddles.left.y &&
        ball.y - ball.radius < paddles.left.y + paddles.left.height) {
      
      this.pong4PlayersGame.lastTouched = paddles.left.player;
      
      ball.dx = Math.abs(ball.dx) * 1.05;
      
      const hitPosition = (ball.y - (paddles.left.y + paddles.left.height / 2)) / (paddles.left.height / 2);
      ball.dy = hitPosition * 6;
    }
    
    if (ball.x + ball.radius > paddles.right.x &&
        ball.x - ball.radius < paddles.right.x + paddles.right.width &&
        ball.y + ball.radius > paddles.right.y &&
        ball.y - ball.radius < paddles.right.y + paddles.right.height) {
      
      this.pong4PlayersGame.lastTouched = paddles.right.player;
      
      ball.dx = -Math.abs(ball.dx) * 1.05;
      
      const hitPosition = (ball.y - (paddles.right.y + paddles.right.height / 2)) / (paddles.right.height / 2);
      ball.dy = hitPosition * 6;
    }
    
    if (ball.y - ball.radius < paddles.top.y + paddles.top.height &&
        ball.y + ball.radius > paddles.top.y &&
        ball.x + ball.radius > paddles.top.x &&
        ball.x - ball.radius < paddles.top.x + paddles.top.width) {
      
      this.pong4PlayersGame.lastTouched = paddles.top.player;
      
      ball.dy = Math.abs(ball.dy) * 1.05;
      
      const hitPosition = (ball.x - (paddles.top.x + paddles.top.width / 2)) / (paddles.top.width / 2);
      ball.dx = hitPosition * 6;
    }
    
    if (ball.y + ball.radius > paddles.bottom.y &&
        ball.y - ball.radius < paddles.bottom.y + paddles.bottom.height &&
        ball.x + ball.radius > paddles.bottom.x &&
        ball.x - ball.radius < paddles.bottom.x + paddles.bottom.width) {
      
      this.pong4PlayersGame.lastTouched = paddles.bottom.player;
      
      ball.dy = -Math.abs(ball.dy) * 1.05;
      
      const hitPosition = (ball.x - (paddles.bottom.x + paddles.bottom.width / 2)) / (paddles.bottom.width / 2);
      ball.dx = hitPosition * 6;
    }
  }
  
  checkGameOver(): void {
    const { scores, maxScore } = this.pong4PlayersGame;
    
    for (const playerId in scores) {
      if (scores[playerId] >= maxScore) {
        const winnerPlayer = this.selectedPlayers.find(p => p.id === parseInt(playerId));
        if (winnerPlayer) {
          this.pong4PlayersGame.gameOver = true;
          this.pong4PlayersGame.winner = winnerPlayer;
          break;
        }
      }
    }
  }
  
  resetBall(): void {
    const { ball, canvas } = this.pongGame;
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.dx = this.gameConfig.ballSpeed * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = (this.gameConfig.ballSpeed * 0.6) * (Math.random() > 0.5 ? 1 : -1);
    
    // Crear nuevo power-up si es necesario
    if (this.gameConfig.enablePowerUps && (!this.pongGame.powerUp || !this.pongGame.powerUp.active) && 
        this.activePowerUps.length === 0) {
      this.spawnCenterPowerUp();
    }
  }
  
  resetBall4Players(): void {
    const { ball, canvas } = this.pong4PlayersGame;
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    let angle = Math.random() * Math.PI * 2;
    while (Math.abs(Math.cos(angle)) < 0.3 || Math.abs(Math.sin(angle)) < 0.3) {
      angle = Math.random() * Math.PI * 2;
    }
    const speed = this.gameConfig.ballSpeed;
    ball.dx = Math.cos(angle) * speed;
    ball.dy = Math.sin(angle) * speed;
    
    // Crear nuevo power-up si es necesario
    if (this.gameConfig.enablePowerUps && (!this.pong4PlayersGame.powerUp || !this.pong4PlayersGame.powerUp.active) && 
        this.activePowerUps.length === 0) {
      this.spawn4PlayerCenterPowerUp();
    }
  }
  
  updatePlayerScore(player: User, score: number): void {
    this.ngZone.run(() => {
      const playerIndex = this.selectedPlayers.findIndex(p => p.id === player.id);
      if (playerIndex === 0) this.player1Score = score;
      else if (playerIndex === 1) this.player2Score = score;
      else if (playerIndex === 2) this.player3Score = score;
      else if (playerIndex === 3) this.player4Score = score;
    });
  }
  
  resetPlayersScores(): void {
    this.ngZone.run(() => {
      this.player1Score = 0;
      this.player2Score = 0;
      this.player3Score = 0;
      this.player4Score = 0;
    });
  }
  
  drawPongGame(): void {
    if (!this.ctx || !this.pongGame) return;
    
    const { paddleLeft, paddleRight, ball, canvas, powerUp } = this.pongGame;
    
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Seleccionar colores basados en el tema
    let backgroundColor, lineColor, paddleColor, ballColor, textColor, accentColor;
    
    switch (this.gameConfig.theme) {
      case 'blue-matrix':
        backgroundColor = '#001520';
        lineColor = '#00ffff';
        paddleColor = '#00aaff';
        ballColor = '#00ffff';
        textColor = '#00ffff';
        accentColor = '#0088ff';
        break;
      case 'red-matrix':
        backgroundColor = '#200000';
        lineColor = '#ff0000';
        paddleColor = '#ff3333';
        ballColor = '#ff0000';
        textColor = '#ff0000';
        accentColor = '#cc0000';
        break;
      default: // tema Matrix verde por defecto
        backgroundColor = '#041a0d';
        lineColor = '#00ff41';
        paddleColor = '#00ff41';
        ballColor = '#00ff41';
        textColor = '#00ff41';
        accentColor = '#00cc33';
        break;
    }
    
    // Dibujar fondo
    this.ctx.fillStyle = backgroundColor;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Efecto Matrix - Líneas de fondo
    this.drawMatrixEffect(canvas, this.gameConfig.theme);
    
    // Línea central
    this.ctx.beginPath();
    this.ctx.setLineDash([5, 5]);
    this.ctx.moveTo(canvas.width / 2, 0);
    this.ctx.lineTo(canvas.width / 2, canvas.height);
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Dibujar paletas con efecto de brillo
    this.ctx.shadowColor = paddleColor;
    this.ctx.shadowBlur = 10;
    this.ctx.fillStyle = paddleColor;
    this.ctx.fillRect(paddleLeft.x, paddleLeft.y, paddleLeft.width, paddleLeft.height);
    this.ctx.fillRect(paddleRight.x, paddleRight.y, paddleRight.width, paddleRight.height);
    this.ctx.shadowBlur = 0;
    
    // Añadir efectos visuales de power-ups activos
    for (const powerUp of this.activePowerUps) {
      if (powerUp.type === 'giant-paddle' || powerUp.type === 'mini-paddle') {
        // Efecto visual para paletas
        const glowColor = powerUp.type === 'giant-paddle' ? '#00ff00' : '#ff0000';
        this.ctx.shadowColor = glowColor;
        this.ctx.shadowBlur = 15;
        this.ctx.strokeStyle = glowColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(paddleLeft.x - 2, paddleLeft.y - 2, paddleLeft.width + 4, paddleLeft.height + 4);
        this.ctx.strokeRect(paddleRight.x - 2, paddleRight.y - 2, paddleRight.width + 4, paddleRight.height + 4);
        this.ctx.shadowBlur = 0;
      }
    }
    
    // Dibujar power-up si está activo
    if (powerUp && powerUp.active) {
      this.ctx.beginPath();
      let powerUpColor;
      
      switch (powerUp.type) {
        case 'giant-paddle': powerUpColor = '#00ff00'; break;
        case 'mini-paddle': powerUpColor = '#ff0000'; break;
        case 'fast-ball': powerUpColor = '#ffcc00'; break;
        case 'inverted-controls': powerUpColor = '#cc00ff'; break;
        default: powerUpColor = textColor;
      }
      
      // Gradient para el power-up
      const powerUpGradient = this.ctx.createRadialGradient(
        powerUp.x, powerUp.y, 0,
        powerUp.x, powerUp.y, powerUp.radius
      );
      powerUpGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      powerUpGradient.addColorStop(0.6, powerUpColor);
      powerUpGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
      
      this.ctx.shadowColor = powerUpColor;
      this.ctx.shadowBlur = 15;
      this.ctx.fillStyle = powerUpGradient;
      this.ctx.arc(powerUp.x, powerUp.y, powerUp.radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Icono en el power-up
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.font = 'bold 14px Arial';
      
      let icon = "P";
      switch (powerUp.type) {
        case 'giant-paddle': icon = "G"; break;
        case 'mini-paddle': icon = "M"; break;
        case 'fast-ball': icon = "F"; break;
        case 'inverted-controls': icon = "I"; break;
      }
      
      this.ctx.fillText(icon, powerUp.x, powerUp.y);
      this.ctx.shadowBlur = 0;
    }
    
    // Dibujar la bola con efecto de brillo
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    
    // Cambiar color de la bola si hay power-up de bola rápida
    const hasFastBall = this.activePowerUps.some(p => p.type === 'fast-ball');
    const ballGlowColor = hasFastBall ? '#ffcc00' : ballColor;
    
    this.ctx.shadowColor = ballGlowColor;
    this.ctx.shadowBlur = 15;
    this.ctx.fillStyle = ballGlowColor;
    this.ctx.fill();
    this.ctx.closePath();
    this.ctx.shadowBlur = 0;
    
    // Si hay power-ups activos, añadir efectos a la bola
    if (hasFastBall) {
      // Efecto de estela para bola rápida
      for (let i = 1; i <= 3; i++) {
        const opacity = 1 - (i * 0.25);
        this.ctx.beginPath();
        this.ctx.arc(ball.x - ball.dx * (i * 0.3), ball.y - ball.dy * (i * 0.3), 
                    ball.radius * (1 - i * 0.2), 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${hasFastBall ? '255, 204, 0' : '0, 255, 65'}, ${opacity})`;
        this.ctx.fill();
        this.ctx.closePath();
      }
    }
    
    // Mostrar indicador de controles invertidos
    if (this.controlsInverted) {
      this.ctx.font = 'bold 18px Arial';
      this.ctx.fillStyle = '#ff3333';
      this.ctx.shadowColor = '#ff3333';
      this.ctx.shadowBlur = 10;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('¡CONTROLES INVERTIDOS!', canvas.width / 2, 30);
      this.ctx.shadowBlur = 0;
    }
    
    // Puntuación
    this.ctx.font = 'bold 36px Arial';
    this.ctx.fillStyle = textColor;
    this.ctx.shadowColor = textColor;
    this.ctx.shadowBlur = 10;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(this.pongGame.player1Score.toString(), canvas.width / 4, 50);
    this.ctx.fillText(this.pongGame.player2Score.toString(), (canvas.width / 4) * 3, 50);
    this.ctx.shadowBlur = 0;
    
    // Información del torneo
    if (this.pongGame.isTournamentMatch && this.pongGame.tournamentRound) {
      this.ctx.font = 'bold 20px Arial';
      this.ctx.fillStyle = accentColor;
      this.ctx.shadowColor = accentColor;
      this.ctx.shadowBlur = 10;
      
      let roundText = '';
      switch (this.pongGame.tournamentRound) {
        case 'semifinals1': roundText = '1ª Semifinal'; break;
        case 'semifinals2': roundText = '2ª Semifinal'; break;
        case 'final': roundText = 'Final del Torneo'; break;
      }
      
      this.ctx.fillText(roundText, canvas.width / 2, 25);
      this.ctx.shadowBlur = 0;
    }
    
    // Pantalla de fin de juego
    if (this.pongGame.gameOver) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Efecto Matrix para la pantalla de game over
      this.drawMatrixRain(canvas);
      
      // Texto de juego terminado con efecto Matrix
      this.ctx.font = 'bold 48px Arial';
      this.ctx.fillStyle = this.gameConfig.theme === 'red-matrix' ? '#ff0000' : 
                          this.gameConfig.theme === 'blue-matrix' ? '#00ffff' : '#00ff41';
      this.ctx.shadowColor = this.ctx.fillStyle;
      this.ctx.shadowBlur = 15;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('JUEGO TERMINADO', canvas.width / 2, canvas.height / 2 - 50);
      
      this.ctx.font = 'bold 32px Arial';
      this.ctx.fillStyle = textColor;
      
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
      
      this.ctx.fillText(`GANADOR: ${winner}`, canvas.width / 2, canvas.height / 2 + 10);
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillText(`${this.pongGame.player1Score} - ${this.pongGame.player2Score}`, canvas.width / 2, canvas.height / 2 + 60);
      this.ctx.shadowBlur = 0;
    }
  }
  
  // Método para dibujar efecto Matrix básico
  drawMatrixEffect(canvas: any, theme: string = 'default'): void {
    const { width, height } = canvas;
    const ctx = this.ctx;
    
    if (!ctx) return;
    
    // Definir color según el tema
    let matrixColor;
    switch (theme) {
      case 'blue-matrix': matrixColor = 'rgba(0, 255, 255, 0.05)'; break;
      case 'red-matrix': matrixColor = 'rgba(255, 0, 0, 0.05)'; break;
      default: matrixColor = 'rgba(0, 255, 65, 0.05)'; break;
    }
    
    // Dibujar líneas de cuadrícula
    ctx.strokeStyle = matrixColor;
    ctx.lineWidth = 1;
    
    // Líneas horizontales
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Líneas verticales
    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }
  
  // Efecto de "lluvia de código" para la pantalla de fin de juego
  drawMatrixRain(canvas: any): void {
    const { width, height } = canvas;
    const ctx = this.ctx;
    
    if (!ctx) return;
    
    // Color según el tema
    let matrixColor;
    switch (this.gameConfig.theme) {
      case 'blue-matrix': matrixColor = '#00ffff'; break;
      case 'red-matrix': matrixColor = '#ff0000'; break;
      default: matrixColor = '#00ff41'; break;
    }
    
    const fontSize = 16;
    const columns = Math.floor(width / fontSize);
    
    // Simular caída de caracteres Matrix
    for (let i = 0; i < columns; i++) {
      // Caracteres aleatorios
      const char = String.fromCharCode(33 + Math.floor(Math.random() * 93));
      
      // Posición y opacidad aleatorias
      const x = i * fontSize;
      const y = Math.random() * height;
      const opacity = Math.random() * 0.5 + 0.1;
      
      ctx.fillStyle = matrixColor.replace(')', `, ${opacity})`).replace('rgb', 'rgba');
      ctx.font = `${fontSize}px Arial`;
      ctx.fillText(char, x, y);
    }
  }
  
  drawPong4PlayersGame(): void {
    if (!this.ctx || !this.pong4PlayersGame) return;
    
    const { paddles, ball, canvas, powerUp, scores } = this.pong4PlayersGame;
    
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Seleccionar colores basados en el tema
    let backgroundColor, lineColor, textColor;
    const paddleColors = this.getPaddleColors();
    
    switch (this.gameConfig.theme) {
      case 'blue-matrix':
        backgroundColor = '#001520';
        lineColor = '#00ffff';
        textColor = '#00ffff';
        break;
      case 'red-matrix':
        backgroundColor = '#200000';
        lineColor = '#ff0000';
        textColor = '#ff0000';
        break;
      default: // tema Matrix verde por defecto
        backgroundColor = '#041a0d';
        lineColor = '#00ff41';
        textColor = '#00ff41';
        break;
    }
    
    // Dibujar fondo
    this.ctx.fillStyle = backgroundColor;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Efecto Matrix - Líneas de fondo
    this.drawMatrixEffect(canvas, this.gameConfig.theme);
    
    // Líneas centrales
    this.ctx.beginPath();
    this.ctx.setLineDash([5, 5]);
    this.ctx.moveTo(canvas.width / 2, 0);
    this.ctx.lineTo(canvas.width / 2, canvas.height);
    this.ctx.moveTo(0, canvas.height / 2);
    this.ctx.lineTo(canvas.width, canvas.height / 2);
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Dibujar paletas con efecto de brillo
    this.ctx.shadowBlur = 10;
    
    this.ctx.shadowColor = paddleColors[0];
    this.ctx.fillStyle = paddleColors[0];
    this.ctx.fillRect(paddles.left.x, paddles.left.y, paddles.left.width, paddles.left.height);
    
    this.ctx.shadowColor = paddleColors[1];
    this.ctx.fillStyle = paddleColors[1];
    this.ctx.fillRect(paddles.right.x, paddles.right.y, paddles.right.width, paddles.right.height);
    
    this.ctx.shadowColor = paddleColors[2];
    this.ctx.fillStyle = paddleColors[2];
    this.ctx.fillRect(paddles.top.x, paddles.top.y, paddles.top.width, paddles.top.height);
    
    this.ctx.shadowColor = paddleColors[3];
    this.ctx.fillStyle = paddleColors[3];
    this.ctx.fillRect(paddles.bottom.x, paddles.bottom.y, paddles.bottom.width, paddles.bottom.height);
    
    this.ctx.shadowBlur = 0;
    
    // Dibujar power-up si está activo
    if (powerUp && powerUp.active) {
      this.ctx.beginPath();
      let powerUpColor;
      
      switch (powerUp.type) {
        case 'giant-paddle': powerUpColor = '#00ff00'; break;
        case 'mini-paddle': powerUpColor = '#ff0000'; break;
        case 'fast-ball': powerUpColor = '#ffcc00'; break;
        case 'inverted-controls': powerUpColor = '#cc00ff'; break;
        default: powerUpColor = textColor;
      }
      
      // Gradient para el power-up
      const powerUpGradient = this.ctx.createRadialGradient(
        powerUp.x, powerUp.y, 0,
        powerUp.x, powerUp.y, powerUp.radius
      );
      powerUpGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      powerUpGradient.addColorStop(0.6, powerUpColor);
      powerUpGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
      
      this.ctx.shadowColor = powerUpColor;
      this.ctx.shadowBlur = 15;
      this.ctx.fillStyle = powerUpGradient;
      this.ctx.arc(powerUp.x, powerUp.y, powerUp.radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Icono en el power-up
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.font = 'bold 14px Arial';
      
      let icon = "P";
      switch (powerUp.type) {
        case 'giant-paddle': icon = "G"; break;
        case 'mini-paddle': icon = "M"; break;
        case 'fast-ball': icon = "F"; break;
        case 'inverted-controls': icon = "I"; break;
      }
      
      this.ctx.fillText(icon, powerUp.x, powerUp.y);
      this.ctx.shadowBlur = 0;
    }
    
    // Dibujar la bola con efecto de brillo
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    
    // Color de la bola según quién la tocó por última vez o si hay power-up
    let ballColor = textColor;
    const hasFastBall = this.activePowerUps.some(p => p.type === 'fast-ball');
    
    if (hasFastBall) {
      ballColor = '#ffcc00';
    } else if (this.pong4PlayersGame.lastTouched) {
      const playerIndex = this.selectedPlayers.findIndex(p => p.id === this.pong4PlayersGame.lastTouched?.id);
      if (playerIndex >= 0) {
        ballColor = paddleColors[playerIndex];
      }
    }
    
    this.ctx.shadowColor = ballColor;
    this.ctx.shadowBlur = 15;
    this.ctx.fillStyle = ballColor;
    this.ctx.fill();
    this.ctx.closePath();
    this.ctx.shadowBlur = 0;
    
    // Efecto de estela para la bola si tiene fast-ball
    if (hasFastBall) {
      for (let i = 1; i <= 3; i++) {
        const opacity = 1 - (i * 0.25);
        this.ctx.beginPath();
        this.ctx.arc(ball.x - ball.dx * (i * 0.3), ball.y - ball.dy * (i * 0.3), 
                     ball.radius * (1 - i * 0.2), 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 204, 0, ${opacity})`;
        this.ctx.fill();
        this.ctx.closePath();
      }
    }
    
    // Mostrar indicador de controles invertidos
    if (this.controlsInverted) {
      this.ctx.font = 'bold 18px Arial';
      this.ctx.fillStyle = '#ff3333';
      this.ctx.shadowColor = '#ff3333';
      this.ctx.shadowBlur = 10;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('¡CONTROLES INVERTIDOS!', canvas.width / 2, canvas.height / 2);
      this.ctx.shadowBlur = 0;
    }
    
    // Puntuaciones
    this.ctx.font = 'bold 24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 8;
    
    // Puntuaciones en las esquinas
    this.ctx.fillStyle = paddleColors[0];
    this.ctx.shadowColor = paddleColors[0];
    this.ctx.fillText(scores[paddles.left.player.id].toString(), 40, 30);
    
    this.ctx.fillStyle = paddleColors[1];
    this.ctx.shadowColor = paddleColors[1];
    this.ctx.fillText(scores[paddles.right.player.id].toString(), canvas.width - 40, 30);
    
    this.ctx.fillStyle = paddleColors[2];
    this.ctx.shadowColor = paddleColors[2];
    this.ctx.fillText(scores[paddles.top.player.id].toString(), 40, canvas.height - 15);
    
    this.ctx.fillStyle = paddleColors[3];
    this.ctx.shadowColor = paddleColors[3];
    this.ctx.fillText(scores[paddles.bottom.player.id].toString(), canvas.width - 40, canvas.height - 15);
    
    this.ctx.shadowBlur = 0;
    
    // Pantalla de fin de juego
    if (this.pong4PlayersGame.gameOver && this.pong4PlayersGame.winner) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Efecto Matrix para la pantalla de fin de juego
      this.drawMatrixRain(canvas);
      
      this.ctx.font = 'bold 48px Arial';
      const gameOverColor = this.gameConfig.theme === 'red-matrix' ? '#ff0000' : 
                            this.gameConfig.theme === 'blue-matrix' ? '#00ffff' : '#00ff41';
      this.ctx.fillStyle = gameOverColor;
      this.ctx.shadowColor = gameOverColor;
      this.ctx.shadowBlur = 15;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('JUEGO TERMINADO', canvas.width / 2, canvas.height / 2 - 50);
      
      this.ctx.font = 'bold 32px Arial';
      this.ctx.fillStyle = textColor;
      this.ctx.shadowColor = textColor;
      this.ctx.fillText(`GANADOR: ${this.pong4PlayersGame.winner.username}`, canvas.width / 2, canvas.height / 2 + 10);
      
      // Mostrar todas las puntuaciones
      this.ctx.font = 'bold 20px Arial';
      let scoreText = '';
      this.selectedPlayers.forEach((player, i) => {
        const score = i === 0 ? this.player1Score : 
                      i === 1 ? this.player2Score :
                      i === 2 ? this.player3Score : this.player4Score;
        scoreText += `${player.username}: ${score}  `;
      });
      this.ctx.fillText(scoreText, canvas.width / 2, canvas.height / 2 + 60);
      this.ctx.shadowBlur = 0;
    }
  }
  
  // Obtener colores para las paletas según el tema seleccionado
  getPaddleColors(): string[] {
    switch (this.gameConfig.theme) {
      case 'blue-matrix':
        return ['#00ffff', '#0088ff', '#00aaff', '#0066bb'];
      case 'red-matrix':
        return ['#ff0000', '#dd0000', '#ff3333', '#aa0000'];
      default: // tema Matrix verde
        return ['#00ff41', '#00cc33', '#00dd44', '#00aa22'];
    }
  }
  
  stopPongGame(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    if (this.pongGame) {
      this.pongGame.running = false;
    }
    if (this.pong4PlayersGame) {
      this.pong4PlayersGame.running = false;
    }
    
    // Limpiar power-ups activos
    this.activePowerUps = [];
    this.controlsInverted = false;
  }
  
  finalizeGame(): void {
    this.stopPongGame();
    
    this.ngZone.run(() => {
      this.player1Score = this.pongGame.player1Score;
      this.player2Score = this.pongGame.player2Score;
      
      if (this.pongGame.isTournamentMatch && this.currentMatch && this.pongGame.tournamentRound) {
        this.finalizeTournamentMatch();
      } else {
        this.gameEnded = true;
        
        const isPlayer1Winner = this.pongGame.winner === 'player1';
        this.saveGameResult(isPlayer1Winner);
      }
    });
  }
  
  finalize4PlayersGame(): void {
    if (!this.pong4PlayersGame || !this.pong4PlayersGame.winner) return;
    
    this.stopPongGame();
    
    this.ngZone.run(() => {
      this.gameEnded = true;
      
      const winnerIndex = this.selectedPlayers.findIndex(p => p.id === this.pong4PlayersGame.winner?.id);
      
      if (winnerIndex >= 0) {
        this.saveGameResult(winnerIndex === 0, winnerIndex);
      } else {
        console.error('No se pudo determinar el ganador');
        this.resetGame();
      }
    });
  }
  
  finalizeTournamentMatch(): void {
    if (!this.currentMatch || !this.pongGame.tournamentRound) return;
    
    this.currentMatch.player1Score = this.pongGame.player1Score;
    this.currentMatch.player2Score = this.pongGame.player2Score;
    
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
    
    const completedMatch: TournamentMatch = {
      player1: { ...this.currentMatch.player1 },
      player2: { ...this.currentMatch.player2 },
      player1Score: this.currentMatch.player1Score,
      player2Score: this.currentMatch.player2Score,
      winner: { ...winner }
    };
    
    this.tournamentMatches.push(completedMatch);
    const currentRound = this.tournamentRound;
    
    if (currentRound === 'semifinals1') {
      this.saveQueue.add(
        completedMatch, 
        currentRound,
        () => {
          this.showAnnouncementBeforeMatch(
            `2do combate: ${this.selectedPlayers[2].username} vs ${this.selectedPlayers[3].username}`,
            () => this.playTournamentMatch(2, 3, 'semifinals2')
          );
        },
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
        () => {
          try {
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
        (error) => {
          console.error('Error en guardado de semifinal 2, intentando continuar con la final:', error);
          try {
            if (this.tournamentMatches.length < 2) {
              throw new Error('No hay suficientes partidos para la final');
            }
            
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
      this.tournamentWinner = winner;
      
      this.saveQueue.add(
        completedMatch, 
        currentRound,
        () => {
          this.showAnnouncementBeforeMatch(
            `¡${this.tournamentWinner?.username || 'Error'} es el CAMPEÓN del torneo!`,
            () => {
              this.gameEnded = true;
            }
          );
        },
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
  
  simulateAIGame(): void {
    setTimeout(() => {
      this.player1Score = Math.floor(Math.random() * 3) + 3;
      this.player2Score = Math.floor(Math.random() * 3);    
      this.gameEnded = true;
      
      const isPlayer1Winner = this.player1Score > this.player2Score;
      this.saveGameResult(isPlayer1Winner);
    }, 3000);
  }
  
  simulateMultiplayerGame(): void {
    setTimeout(() => {
      this.player1Score = Math.floor(Math.random() * 5) + 3;
      this.player2Score = Math.floor(Math.random() * 5);
      
      if (this.playerCount >= 3) {
        this.player3Score = Math.floor(Math.random() * 5);
      }
      
      if (this.playerCount >= 4) {
        this.player4Score = Math.floor(Math.random() * 5);
      }
      
      this.gameEnded = true;
      
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
    
    this.saveQueue.clear();
    this.tournamentMatches = [];
    this.tournamentRound = 'semifinals1';
    
    this.showAnnouncementBeforeMatch(
      `1er combate: ${this.selectedPlayers[0].username} vs ${this.selectedPlayers[1].username}`,
      () => this.playTournamentMatch(0, 1, 'semifinals1')
    );
  }
  
  playTournamentMatch(player1Index: number, player2Index: number, round: 'semifinals1' | 'semifinals2' | 'final'): void {
    if (player1Index < 0 || player1Index >= this.selectedPlayers.length || 
        player2Index < 0 || player2Index >= this.selectedPlayers.length) {
      console.error('Índices de jugadores inválidos:', { player1Index, player2Index });
      this.resetGame();
      return;
    }
    
    try {
      this.currentMatch = {
        player1: { ...this.selectedPlayers[player1Index] },
        player2: { ...this.selectedPlayers[player2Index] },
        player1Score: 0,
        player2Score: 0
      };
      
      this.tournamentRound = round;
      
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
    
    setTimeout(() => {
      try {
        let score1, score2;
        do {
          score1 = Math.floor(Math.random() * 7) + 1;
          score2 = Math.floor(Math.random() * 7) + 1;
        } while (score1 === score2);
        
        this.currentMatch!.player1Score = score1;
        this.currentMatch!.player2Score = score2;
        this.player1Score = score1;
        this.player2Score = score2;
        
        const isPlayer1Winner = score1 > score2;
        const winner = isPlayer1Winner ? this.currentMatch!.player1 : this.currentMatch!.player2;
        this.currentMatch!.winner = winner;
        
        console.log(`Partido ${this.tournamentRound} finalizado (simulado):`, {
          player1: this.currentMatch!.player1.username,
          player2: this.currentMatch!.player2.username,
          score1: score1,
          score2: score2,
          winner: winner.username
        });
        
        const completedMatch: TournamentMatch = {
          player1: { ...this.currentMatch!.player1 },
          player2: { ...this.currentMatch!.player2 },
          player1Score: this.currentMatch!.player1Score,
          player2Score: this.currentMatch!.player2Score,
          winner: { ...winner }
        };
        
        this.tournamentMatches.push(completedMatch);
        this.finalizeTournamentMatch();
      } catch (error) {
        console.error('Error en simulateTournamentMatch:', error);
        this.resetGame();
      }
    }, 3000);
  }
  
  showAnnouncementBeforeMatch(message: string, callback: () => void): void {
    this.announcementMessage = message;
    this.showAnnouncement = true;
    
    setTimeout(() => {
      this.showAnnouncement = false;
      setTimeout(callback, 500);
    }, 3000);
  }
  
  saveGameResult(isPlayer1Winner: boolean, winnerIndex: number = 0): void {
    if (this.isAgainstAI) {
      this.matchService.createAIMatch(
        this.player1Score,
        this.player2Score,
        isPlayer1Winner,
        this.gameConfig.aiDifficulty
      ).subscribe({
        next: (response) => {
          console.log('Partido contra IA guardado correctamente:', response);
          alert(`¡Juego terminado! Resultado: ${this.player1Score} - ${this.player2Score}`);
          this.resetGame();
        },
        error: (error) => {
          console.error('Error al guardar el partido contra IA:', error);
          alert('Error al guardar el resultado del partido');
        }
      });
    } else {
      const matchType = this.playerCount === 2 ? 'local' : '4players';
      
      const winnerUsername = this.selectedPlayers[winnerIndex].username;
      
      let matchData: any = {
        match_type: matchType,
        winner_username: winnerUsername,
        player1_score: this.player1Score,
        player2_score: this.player2Score
      };
      
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
          
          let resultText = `¡Juego terminado! Resultado: ${this.player1Score} - ${this.player2Score}`;
          
          if (this.playerCount >= 4) {
            resultText += ` - ${this.player3Score} - ${this.player4Score}`;
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
    this.saveQueue.clear();
    
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
    this.playerCount = 2;
    this.isTournament = false;
    this.tournamentRound = 'semifinals1';
    this.tournamentMatches = [];
    this.currentMatch = null;
    this.tournamentWinner = null;
    
    // Resetear power-ups y estado relacionado
    this.activePowerUps = [];
    this.controlsInverted = false;
    
    // Resetear la IA
    this.lastAIUpdate = 0;
    this.aiPredictedBallPosition = { x: 0, y: 0 };
    
    if (this.currentUser) {
      this.selectedPlayers = [this.currentUser];
    } else {
      this.selectedPlayers = [];
    }
  }
  
  goBack(): void {
    if (this.gameStarted) {
      if (confirm(this.translations[this.currentLanguage].confirm_abandon_game)) {
        this.resetGame();
      }
    } else if (this.showPlayerSelection) {
      this.showPlayerSelection = false;
      this.showGameModes = true;
    } else if (this.showGameModes) {
      this.showGameModes = false;
    }
  }
}