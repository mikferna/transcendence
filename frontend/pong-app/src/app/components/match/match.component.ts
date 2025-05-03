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
  tournamentName: string;
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
    theme: 'default' | 'blue-matrix' | 'red-matrix';
    aiDifficulty: 'easy' | 'hard';
  } = {
    ballSpeed: 5,
    ballSize: 8,
    paddleSize: 80,
    theme: 'default',
    aiDifficulty: 'easy'
  };
  
  // IA mejorada
  lastAIUpdate: number = 0;
  aiUpdateInterval: number = 1000; // 1 segundo
  aiPredictedBallPosition: { x: number, y: number } = { x: 0, y: 0 };
  private aiTargetY: number = 0;                   // Posición objetivo del centro de la paleta
  private aiPreviousTargets: number[] = [];        // Historial de objetivos para suavizar movimientos
  private aiRandomFactor: number = 0;              // Factor aleatorio para comportamiento humano
  private aiMissRate: number = 0;                  // Probabilidad de errar deliberadamente
  private aiMaxPredictionSteps: number = 200;      // Máximo de pasos para predecir la trayectoria
  private aiDecisionInProgress: boolean = false;   // Bandera para evitar cálculos simultáneos
  
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
  private consecutiveCollisions: number = 0;
  
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
    confirm_abandon_game: '¿Seguro que quieres abandonar el juego en curso?',
    game_end: 'JUEGO TERMINADO',
    winner_win: 'GANADOR',
    player: 'Jugador',
    ai: 'IA'
  },
  eus: {
    initialicing_system: 'Sistema abiatzen...',
    defy_other_users: 'Erronka egin beste jokalariei',
    start_game: 'JOKOA HASI',
    choose_mode: 'MODUA AUKERATU',
    choose_game_mode: 'Aukeratu joko modua',
    one_vs_one_game: '1 VS 1 JOKOA',
    four_players_game: '4 JOKALARI JOKOA',
    game_vs_computer: 'ORDENAGAILUAREN KONTRA',
    four_player_tornament: 'TXAPELKETA (4 JOKALARI)',
    configuration: 'KONFIGURAZIOA',
    go_back: 'ITZULI',
    choose_players: 'JOKALARIAK AUKERATU',
    required: 'Behar dira ',
    to_play: ' jokalari hasteko',
    required_four_player_for_tournament: '4 jokalari behar dira txapelketarako',
    chosed_players: 'AUKERATUTAKO JOKALARIAK ',
    search_players: 'JOKALARIAK BILATU',
    search_by_username: 'ERABILTZAILE IZENAGATIK BILATU',
    searching_players: 'JOKALARIAK BILATZEN...',
    no_players_found: 'EZ DA JOKALARIAK AURKITU',
    cancel: 'EZEZTATU',
    game_parameters: 'JOKOA HASI',
    ball_speed: 'Pilotaren abiadura:',
    ball_size: 'Pilotaren tamaina:',
    paddle_size: 'Erraketaren tamaina:',
    enable_power_ups: 'Power-upak gaitu:',
    ai_difficulty: 'AA zailtasuna',
    easy: 'Erraza',
    medium: 'Ertaina',
    hard: 'Zaila',
    theme: 'ITXURA',
    green: 'Berdea',
    blue: 'Urdina',
    red: 'Gorria',
    save: 'GORDE',
    semifinal_one: '1. FINALERDIA',
    semifinal_two: '2. FINALERDIA',
    tournament_end: 'TXAPELKETAREN FINALA',
    game_on: 'PARTIDA MARTXAN',
    vs: 'VS',
    computer: 'ORDENAGAILUA',
    tournament_ended: 'TXAPELKETA AMAITUTA',
    winner: 'TXAPELDUNA',
    matches_history: 'PARTIDEN HISTORIA:',
    control_two_players: 'KONTROLAK: 1 Jokalaria [W/S] - 2 Jokalaria [↑/↓]',
    controls_ai: 'KONTROLAK: Erabili [W/S] erraketa mugitzeko',
    controls: 'KONTROLAK:',
    player_left: '1 Jokalaria (ezkerra): [W/S]',
    palyer_right: '2 Jokalaria (eskuina): [↑/↓]',
    palyer_up: '3 Jokalaria (goikoa): [A/D]',
    palyer_down: '4 Jokalaria (behekoa): [J/L]',
    exit: 'IRTEN',
    confirm_abandon_game: 'Ziur zaude uneko partidatik irten nahi duzula?',
    game_end: 'Jokoa amaituta',
    winner_win: 'IRABAZLEA',
    player: 'Jokalaria',
    ai: 'AA'
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
    confirm_abandon_game: 'Are you sure you want to abandon the current game?',
    game_end: 'Game end',
    winner_win: 'WINNER',
    player: 'Player',
    ai: 'AI'
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
        // Ajustar tamaño con proporción 16:9 y asegurar que se vea todo el campo
        const containerWidth = Math.min(1000, container.clientWidth - 20);
        canvas.width = containerWidth;
        // Aplicar relación de aspecto 16:9
        canvas.height = containerWidth * (9/16);
        
        // Asegurar que el canvas se ajuste correctamente al contenedor
        container.style.height = canvas.height + 'px';
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
      };
      
      // Inicializar la IA
      if (isAI) {
        this.lastAIUpdate = Date.now();
        this.aiPredictedBallPosition = { 
          x: this.pongGame.ball.x, 
          y: this.pongGame.ball.y 
        };
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
        // Ajustar tamaño con proporción 16:9 y asegurar que se vea todo el campo
        const containerWidth = Math.min(1000, container.clientWidth - 20);
        canvas.width = containerWidth;
        // Aplicar relación de aspecto 16:9
        canvas.height = containerWidth * (9/16);
        
        // Asegurar que el canvas se ajuste correctamente al contenedor
        container.style.height = canvas.height + 'px';
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
        lastTouched: null
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
    const { paddleLeft, ball, canvas } = this.pongGame;
    const paddleRight = this.pongGame.paddleRight;
    
    // Controles del jugador 1 (izquierda)
    if (this.keysPressed.has('w')) {
      paddleLeft.y = Math.max(0, paddleLeft.y - 8);
    }
    if (this.keysPressed.has('s')) {
      paddleLeft.y = Math.min(canvas.height - paddleLeft.height, paddleLeft.y + 8);
    }
    
    // IA o jugador 2 (derecha)
    if (isAI) {
      // Actualizar la lógica de la IA (simulación de teclas)
      this.updateAI();
      
      // Aplicar el movimiento basado en las teclas simuladas
      this.applyAIMovement();
    } else {
      // Controles manuales del jugador 2 (derecha)
      if (this.keysPressed.has('arrowup')) {
        paddleRight.y = Math.max(0, paddleRight.y - 8);
      }
      if (this.keysPressed.has('arrowdown')) {
        paddleRight.y = Math.min(canvas.height - paddleRight.height, paddleRight.y + 8);
      }
    }
    
    // Guardar la posición anterior para poder corregirla si hay problemas
    const prevBallX = ball.x;
    const prevBallY = ball.y;
    
    // Actualización de la física de la bola
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    // Variables para detectar colisiones múltiples
    let hasCollided = false;
    
    // Colisiones con paredes superior e inferior
    if (ball.y - ball.radius < 0) {
      // Colisión con pared superior
      ball.dy = Math.abs(ball.dy); // Asegurar que la dirección es positiva (hacia abajo)
      ball.y = ball.radius; // Reposicionar para evitar quedarse atrapado
      
      // Añadir pequeña variación para evitar patrones repetitivos
      ball.dx = ball.dx * (1 + (Math.random() * 0.1 - 0.05));
      hasCollided = true;
    } else if (ball.y + ball.radius > canvas.height) {
      // Colisión con pared inferior
      ball.dy = -Math.abs(ball.dy); // Asegurar que la dirección es negativa (hacia arriba)
      ball.y = canvas.height - ball.radius; // Reposicionar
      
      // Añadir pequeña variación para evitar patrones repetitivos
      ball.dx = ball.dx * (1 + (Math.random() * 0.1 - 0.05));
      hasCollided = true;
    }
    
    // Colisiones con paletas
    if (this.checkPaddleCollision(ball, paddleLeft)) {
      // Colisión con paleta izquierda
      ball.dx = Math.abs(ball.dx) * 1.05; // Asegurar dirección positiva (hacia la derecha)
      // Reposicionar para evitar quedarse atrapado
      ball.x = paddleLeft.x + paddleLeft.width + ball.radius;
      
      const hitPosition = (ball.y - (paddleLeft.y + paddleLeft.height / 2)) / (paddleLeft.height / 2);
      ball.dy = hitPosition * 6;
      
      this.lastCollisionPaddle = 'left';
      hasCollided = true;
    } else if (this.checkPaddleCollision(ball, paddleRight)) {
      // Colisión con paleta derecha
      ball.dx = -Math.abs(ball.dx) * 1.05; // Asegurar dirección negativa (hacia la izquierda)
      // Reposicionar para evitar quedarse atrapado
      ball.x = paddleRight.x - ball.radius;
      
      const hitPosition = (ball.y - (paddleRight.y + paddleRight.height / 2)) / (paddleRight.height / 2);
      ball.dy = hitPosition * 6;
      
      this.lastCollisionPaddle = 'right';
      hasCollided = true;
    }
    
    // Si hay múltiples colisiones consecutivas, añadir un factor aleatorio más grande
    if (hasCollided && this.consecutiveCollisions > 3) {
      // Añadir un impulso aleatorio para romper los patrones de colisión
      const randomAngle = (Math.random() * Math.PI / 4) - (Math.PI / 8); // Entre -22.5 y 22.5 grados
      const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      const currentAngle = Math.atan2(ball.dy, ball.dx);
      const newAngle = currentAngle + randomAngle;
      
      ball.dx = Math.cos(newAngle) * speed;
      ball.dy = Math.sin(newAngle) * speed;
      
      this.consecutiveCollisions = 0;
    } else if (hasCollided) {
      this.consecutiveCollisions++;
    } else {
      this.consecutiveCollisions = 0;
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
    
    // Verificar fin del juego
    if (this.pongGame.player1Score >= this.pongGame.maxScore) {
      this.pongGame.gameOver = true;
      this.pongGame.winner = 'player1';
    } else if (this.pongGame.player2Score >= this.pongGame.maxScore) {
      this.pongGame.gameOver = true;
      this.pongGame.winner = 'player2';
    }
  }
  
  // Mover la paleta de la IA simulando pulsaciones de teclas
  moveAIPaddle(): void {
    if (!this.pongGame) return;
    
    const paddleRight = this.pongGame.paddleRight;
    const paddleCenter = paddleRight.y + paddleRight.height / 2;
    const speed = this.getAISpeed();
    
    // Limpiar pulsaciones anteriores
    this.keysPressed.delete('arrowup');
    this.keysPressed.delete('arrowdown');
    
    // Determinar qué tecla presionar basado en la distancia al objetivo
    const distance = this.aiTargetY - paddleCenter;
    
    // Solo moverse si la distancia es significativa (evitar micro-movimientos)
    if (Math.abs(distance) > speed) {
      if (distance < 0) {
        // Simular presionar tecla arriba
        this.keysPressed.add('arrowup');
      } else {
        // Simular presionar tecla abajo
        this.keysPressed.add('arrowdown');
      }
      
      // Registro para depuración
      console.log(`IA: moviendo paleta hacia ${distance < 0 ? 'arriba' : 'abajo'}, 
        distancia=${Math.abs(distance).toFixed(1)}, 
        target=${this.aiTargetY.toFixed(1)}, 
        actual=${paddleCenter.toFixed(1)}`);
    }
  }
  
  // Predicción de la trayectoria de la pelota
  predictBallPosition(): number {
    const { ball, canvas, paddleLeft } = this.pongGame;
    const paddleRight = this.pongGame.paddleRight;
    
    // Crear una copia de la pelota para la simulación
    const simBall = {
      x: ball.x,
      y: ball.y,
      dx: ball.dx,
      dy: ball.dy,
      radius: ball.radius
    };
    
    // Variables para rastrear rebotes
    let hitYPosition = 0;
    let iterations = 0;
    let foundImpact = false;
    
    // Simular la trayectoria hasta que alcance el lado derecho o se exceda el límite
    while (!foundImpact && iterations < this.aiMaxPredictionSteps) {
      // Actualizar posición
      simBall.x += simBall.dx;
      simBall.y += simBall.dy;
      iterations++;
      
      // Comprobar rebotes en paredes superior e inferior
      if (simBall.y - simBall.radius < 0 || simBall.y + simBall.radius > canvas.height) {
        simBall.dy = -simBall.dy;
        // Asegurar que la pelota no quede atrapada en las paredes
        if (simBall.y < simBall.radius) {
          simBall.y = simBall.radius;
        } else if (simBall.y > canvas.height - simBall.radius) {
          simBall.y = canvas.height - simBall.radius;
        }
      }
      
      // Comprobar rebote en paleta izquierda (jugador)
      if (simBall.x - simBall.radius < paddleLeft.x + paddleLeft.width && 
          simBall.x + simBall.radius > paddleLeft.x &&
          simBall.y + simBall.radius > paddleLeft.y &&
          simBall.y - simBall.radius < paddleLeft.y + paddleLeft.height &&
          simBall.dx < 0) {  // Solo si va hacia la izquierda
        
        // Simular el cálculo de ángulo basado en donde golpea la paleta
        const hitPosition = (simBall.y - (paddleLeft.y + paddleLeft.height / 2)) / (paddleLeft.height / 2);
        const bounceAngle = hitPosition * Math.PI * 0.35; // -35 a +35 grados aprox
        
        // Calcular nueva dirección y velocidad
        const speed = Math.sqrt(simBall.dx * simBall.dx + simBall.dy * simBall.dy);
        simBall.dx = Math.abs(Math.cos(bounceAngle) * speed) * 1.05; // 5% más rápido en cada golpe
        simBall.dy = Math.sin(bounceAngle) * speed * 1.05;
      }
      
      // Comprobar si la pelota llega al lado de la IA
      if (simBall.x + simBall.radius >= canvas.width - paddleRight.width && !foundImpact) {
        foundImpact = true;
        hitYPosition = simBall.y;
      }
    }
    
    // Si encontramos el punto de impacto, usarlo como objetivo
    if (foundImpact) {
      return hitYPosition;
    }
    
    // Si no se encontró el punto de impacto, usar una predicción simple
    return simBall.y;
  }
  
  // Este método debe aplicar el movimiento basado en las teclas simuladas
  applyAIMovement(): void {
    const { canvas } = this.pongGame;
    const paddleRight = this.pongGame.paddleRight;
    const speed = this.getAISpeed();
    
    // Aplicar el movimiento basado en las teclas simuladas
    if (this.keysPressed.has('arrowup')) {
      paddleRight.y = Math.max(0, paddleRight.y - speed);
    }
    if (this.keysPressed.has('arrowdown')) {
      paddleRight.y = Math.min(canvas.height - paddleRight.height, paddleRight.y + speed);
    }
  }
  
  // Configuración de la IA según la dificultad
  configureAIDifficulty(): void {
    if (this.gameConfig.aiDifficulty === 'easy') {
      this.aiMissRate = 0.3;                 // 30% de probabilidad de error intencional
      this.aiMaxPredictionSteps = 100;       // Predicción limitada
      this.aiRandomFactor = 0.4;             // Mayor aleatoriedad en movimientos
    } else { // Modo difícil
      this.aiMissRate = 0.05;                // 5% de probabilidad de error intencional
      this.aiMaxPredictionSteps = 300;       // Predicción más extensa
      this.aiRandomFactor = 0.1;             // Menor aleatoriedad
    }
  }
  
  // Calcular dónde debería moverse la paleta
  calculateAITargetPosition(): void {
    const { ball, canvas } = this.pongGame;
    const paddleRight = this.pongGame.paddleRight;
    
    // A) Si la pelota se aleja de la IA, regresar gradualmente al centro
    if (ball.dx < 0) {
      // Agregar algo de aleatoriedad al centro para parecer más humano
      const randomOffset = (Math.random() * 2 - 1) * canvas.height * 0.2 * this.aiRandomFactor;
      this.aiTargetY = canvas.height / 2 + randomOffset;
      return;
    }
    
    // B) Simular el recorrido de la pelota para predecir dónde golpeará
    let targetY = this.predictBallPosition();
    
    // C) Determinar si debemos fallar intencionalmente (comportamiento humano)
    if (Math.random() < this.aiMissRate) {
      // Crear un error intencional significativo
      const errorMagnitude = paddleRight.height * (Math.random() > 0.5 ? 1 : -1);
      targetY += errorMagnitude;
      console.log("IA: Error intencional aplicado");
    }
    
    // D) Agregar variación aleatoria sutil
    const randomVariation = (Math.random() * 2 - 1) * this.aiRandomFactor * paddleRight.height * 0.5;
    targetY += randomVariation;
    
    // E) Mantener un historial de objetivos para crear movimientos más suaves
    this.aiPreviousTargets.push(targetY);
    // Mantener solo las últimas 3 posiciones
    if (this.aiPreviousTargets.length > 3) {
      this.aiPreviousTargets.shift();
    }
    
    // F) Promedio ponderado de posiciones recientes (movimiento más natural)
    if (this.aiPreviousTargets.length > 1) {
      let weightedSum = 0;
      let totalWeight = 0;
      
      for (let i = 0; i < this.aiPreviousTargets.length; i++) {
        const weight = i + 1; // Dar más peso a los objetivos más recientes
        weightedSum += this.aiPreviousTargets[i] * weight;
        totalWeight += weight;
      }
      
      this.aiTargetY = weightedSum / totalWeight;
    } else {
      this.aiTargetY = targetY;
    }
  }
  
  // Método principal que maneja la IA
  updateAI(): void {
    if (!this.pongGame) return;
    
    const now = Date.now();
    
    // Solo actualizar la IA cada segundo como se requiere
    if (now - this.lastAIUpdate >= this.aiUpdateInterval) {
      this.lastAIUpdate = now;
      
      // Evitar múltiples cálculos simultáneos
      if (!this.aiDecisionInProgress) {
        this.aiDecisionInProgress = true;
        
        // Configurar parámetros de dificultad
        this.configureAIDifficulty();
        
        // Predecir la posición futura de la pelota
        this.calculateAITargetPosition();
        
        // Resetear la bandera cuando termine
        this.aiDecisionInProgress = false;
      }
    }
    
    // Mover la paleta basándose en el objetivo actual
    this.moveAIPaddle();
  }
  
  getAISpeed(): number {
    return this.gameConfig.aiDifficulty === 'easy' ? 4 : 8; // 4 para fácil, 8 para difícil
  }
  
  updatePong4PlayersGame(): void {
    const { paddles, ball, canvas, scores } = this.pong4PlayersGame;
    
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
    
    // Guardar posición anterior
    const prevBallX = ball.x;
    const prevBallY = ball.y;
    
    // Actualizar posición de la pelota
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    // Variable para detectar colisiones
    let hasCollided = false;
    
    // Revisar colisiones con las paletas primero
    this.checkPaddle4PlayersCollision();
    
    // Colisiones con bordes (puntuación)
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
  
  private lastCollisionPaddle: 'left' | 'right' | null = null;
  
  checkPaddleCollision(ball: any, paddle: any): boolean {
    // Calcular las distancias entre el centro de la bola y los bordes del rectángulo de la paleta
    const distX = Math.abs(ball.x - (paddle.x + paddle.width / 2));
    const distY = Math.abs(ball.y - (paddle.y + paddle.height / 2));
  
    // Si la distancia es mayor que la suma del radio y la mitad del ancho/alto, no hay colisión
    if (distX > (paddle.width / 2 + ball.radius)) return false;
    if (distY > (paddle.height / 2 + ball.radius)) return false;
  
    // Si la distancia es menor que la mitad del ancho/alto, hay colisión
    if (distX <= (paddle.width / 2)) return true;
    if (distY <= (paddle.height / 2)) return true;
  
    // Comprobar colisión en las esquinas
    const dx = distX - paddle.width / 2;
    const dy = distY - paddle.height / 2;
    return (dx * dx + dy * dy <= (ball.radius * ball.radius));
  }
  
  checkPaddle4PlayersCollision(): void {
    const { paddles, ball } = this.pong4PlayersGame;
    let hasCollided = false;
    
    // Colisión con paleta izquierda
    if (ball.x - ball.radius < paddles.left.x + paddles.left.width &&
        ball.x + ball.radius > paddles.left.x &&
        ball.y + ball.radius > paddles.left.y &&
        ball.y - ball.radius < paddles.left.y + paddles.left.height) {
      
      this.pong4PlayersGame.lastTouched = paddles.left.player;
      
      ball.dx = Math.abs(ball.dx) * 1.05;
      // Reposicionar para evitar que se quede atrapada
      ball.x = paddles.left.x + paddles.left.width + ball.radius;
      
      const hitPosition = (ball.y - (paddles.left.y + paddles.left.height / 2)) / (paddles.left.height / 2);
      ball.dy = hitPosition * 6;
      
      hasCollided = true;
    }
    
    // Colisión con paleta derecha
    if (ball.x + ball.radius > paddles.right.x &&
        ball.x - ball.radius < paddles.right.x + paddles.right.width &&
        ball.y + ball.radius > paddles.right.y &&
        ball.y - ball.radius < paddles.right.y + paddles.right.height) {
      
      this.pong4PlayersGame.lastTouched = paddles.right.player;
      
      ball.dx = -Math.abs(ball.dx) * 1.05;
      // Reposicionar para evitar que se quede atrapada
      ball.x = paddles.right.x - ball.radius;
      
      const hitPosition = (ball.y - (paddles.right.y + paddles.right.height / 2)) / (paddles.right.height / 2);
      ball.dy = hitPosition * 6;
      
      hasCollided = true;
    }
    
    // Colisión con paleta superior
    if (ball.y - ball.radius < paddles.top.y + paddles.top.height &&
        ball.y + ball.radius > paddles.top.y &&
        ball.x + ball.radius > paddles.top.x &&
        ball.x - ball.radius < paddles.top.x + paddles.top.width) {
      
      this.pong4PlayersGame.lastTouched = paddles.top.player;
      
      ball.dy = Math.abs(ball.dy) * 1.05;
      // Reposicionar para evitar que se quede atrapada
      ball.y = paddles.top.y + paddles.top.height + ball.radius;
      
      const hitPosition = (ball.x - (paddles.top.x + paddles.top.width / 2)) / (paddles.top.width / 2);
      ball.dx = hitPosition * 6;
      
      hasCollided = true;
    }
    
    // Colisión con paleta inferior
    if (ball.y + ball.radius > paddles.bottom.y &&
        ball.y - ball.radius < paddles.bottom.y + paddles.bottom.height &&
        ball.x + ball.radius > paddles.bottom.x &&
        ball.x - ball.radius < paddles.bottom.x + paddles.bottom.width) {
      
      this.pong4PlayersGame.lastTouched = paddles.bottom.player;
      
      ball.dy = -Math.abs(ball.dy) * 1.05;
      // Reposicionar para evitar que se quede atrapada
      ball.y = paddles.bottom.y - ball.radius;
      
      const hitPosition = (ball.x - (paddles.bottom.x + paddles.bottom.width / 2)) / (paddles.bottom.width / 2);
      ball.dx = hitPosition * 6;
      
      hasCollided = true;
    }
    
    // Si hay múltiples colisiones consecutivas, añadir un factor aleatorio
    if (hasCollided && this.consecutiveCollisions > 3) {
      // Añadir un impulso aleatorio para romper los patrones de colisión
      const randomAngle = (Math.random() * Math.PI / 4) - (Math.PI / 8);
      const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      const currentAngle = Math.atan2(ball.dy, ball.dx);
      const newAngle = currentAngle + randomAngle;
      
      ball.dx = Math.cos(newAngle) * speed;
      ball.dy = Math.sin(newAngle) * speed;
      
      this.consecutiveCollisions = 0;
    } else if (hasCollided) {
      this.consecutiveCollisions++;
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
    
    // Añadir más variación en el ángulo de lanzamiento
    const angle = (Math.random() * Math.PI / 2) - (Math.PI / 4); // Entre -45 y 45 grados
    const direction = Math.random() > 0.5 ? 1 : -1;
    const speed = this.gameConfig.ballSpeed;
    
    ball.dx = Math.cos(angle) * speed * direction;
    ball.dy = Math.sin(angle) * speed;
    
    // Resetear el contador de colisiones consecutivas
    this.consecutiveCollisions = 0;
  }
  
  resetBall4Players(): void {
    const { ball, canvas } = this.pong4PlayersGame;
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    
    // Usar un ángulo aleatorio para mayor variedad
    let angle = Math.random() * Math.PI * 2;
    
    // Asegurarse de que el ángulo no sea demasiado vertical u horizontal
    while (Math.abs(Math.cos(angle)) < 0.3 || Math.abs(Math.sin(angle)) < 0.3) {
      angle = Math.random() * Math.PI * 2;
    }
    
    const speed = this.gameConfig.ballSpeed;
    ball.dx = Math.cos(angle) * speed;
    ball.dy = Math.sin(angle) * speed;
    
    // Resetear el contador de colisiones consecutivas
    this.consecutiveCollisions = 0;
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
    
    const { paddleLeft, paddleRight, ball, canvas } = this.pongGame;
    
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
    
    // Dibujar la bola con efecto de brillo
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    
    this.ctx.shadowColor = ballColor;
    this.ctx.shadowBlur = 15;
    this.ctx.fillStyle = ballColor;
    this.ctx.fill();
    this.ctx.closePath();
    this.ctx.shadowBlur = 0;
    
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
      this.ctx.fillText(this.translations[this.currentLanguage].game_end, canvas.width / 2, canvas.height / 2 - 50);
      
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

      this.ctx.fillText(`${this.translations[this.currentLanguage].winner_win}: ${winner}`, canvas.width / 2, canvas.height / 2 + 10);
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
    
    const { paddles, ball, canvas, scores } = this.pong4PlayersGame;
    
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
    
    // Dibujar la bola con efecto de brillo
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    
    // Color de la bola según quién la tocó por última vez
    let ballColor = textColor;
    
    if (this.pong4PlayersGame.lastTouched) {
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
        // Antes del cambio: siempre pasaba isPlayer1Winner = true
        // Después del cambio: pasa isPlayer1Winner solo si realmente ganó player1 (winnerIndex === 0)
        const isPlayer1Winner = winnerIndex === 0;
        this.saveGameResult(isPlayer1Winner, winnerIndex);
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
      
      const isPlayer1Winner = winnerIndex === 0;
      this.saveGameResult(isPlayer1Winner, winnerIndex);
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
  
  saveGameResult(isPlayer1Winner: boolean, winnerIndex: number = -1): void {
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
      
      // Si no se proporciona winnerIndex o es -1, determinar según isPlayer1Winner
      if (winnerIndex === -1) {
        winnerIndex = isPlayer1Winner ? 0 : 1;
      }
      
      // Verificación adicional para asegurarse de que el índice es válido
      if (winnerIndex < 0 || winnerIndex >= this.selectedPlayers.length) {
        console.error('Índice de ganador no válido:', winnerIndex);
        winnerIndex = 0; // Fallback
      }
      
      const winnerUsername = this.selectedPlayers[winnerIndex].username;
      console.log(`Guardando partido con ganador: ${winnerUsername} (índice ${winnerIndex}, isPlayer1Winner: ${isPlayer1Winner})`);
      
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