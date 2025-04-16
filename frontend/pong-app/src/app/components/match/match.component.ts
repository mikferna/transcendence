import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

interface User {
  id: number;
  username: string;
  avatar: string;
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
  showGameModes: boolean = false;
  showPlayerCount: boolean = false;
  showPlayerSelection: boolean = false;
  selectedMode: string = '';
  playerCount: number = 0;
  currentUser: User | null = null;
  searchQuery: string = '';
  searchResults: User[] = [];
  selectedPlayers: User[] = [];
  isLoading: boolean = false;
  loggedInUser: any;
  
  constructor(private http: HttpClient, private authService: AuthService) {}
  
  ngOnInit(): void {
    // Llamamos directamente a getCurrentUser en lugar de usar authService.getCurrentUser()
    this.getCurrentUser();
  }
  
  getCurrentUser(): void {
    const token = localStorage.getItem('access_token');
    if (token) {
      this.http.get<User>(`${environment.apiUrl}/current-user/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).subscribe({
        next: (user) => {
          this.currentUser = user;
          this.loggedInUser = user; // También actualizamos loggedInUser
          if (this.currentUser) {
            this.selectedPlayers = [this.currentUser];
          }
        },
        error: (error) => {
          console.error('Error al obtener el usuario actual:', error);
        }
      });
    }
  }
  
  playGame(): void {
    this.showGameModes = true;
  }
  
  configureGame(): void {
    console.log('Botón Configurar presionado');
    // Aquí irá la lógica para configurar el juego
  }
  
  selectGameMode(mode: string): void {
    this.selectedMode = mode;
    if (mode === '1v1') {
      this.showPlayerCount = true;
    } else {
      console.log(`Modo de juego seleccionado: ${mode}`);
      // Aquí irá la lógica para iniciar el juego con el modo seleccionado
    }
  }
  
  selectPlayerCount(count: number): void {
    this.playerCount = count;
    this.showPlayerSelection = true;
  }
  
  searchUsers(): void {
    if (this.searchQuery.trim() === '') {
      this.searchResults = [];
      return;
    }
    
    this.isLoading = true;
    const token = localStorage.getItem('access_token');
    
    this.http.get<User[]>(`${environment.apiUrl}/users/search/?query=${this.searchQuery}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).subscribe({
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
    }
  }
  
  removePlayer(player: User): void {
    if (player.id !== this.currentUser?.id) {
      this.selectedPlayers = this.selectedPlayers.filter(p => p.id !== player.id);
    }
  }
  
  startGame(): void {
    if (this.selectedPlayers.length === this.playerCount) {
      console.log('Iniciando juego con los siguientes jugadores:', this.selectedPlayers);
      // Aquí irá la lógica para iniciar el juego con los jugadores seleccionados
    }
  }
  
  goBack(): void {
    if (this.showPlayerSelection) {
      this.showPlayerSelection = false;
    } else if (this.showPlayerCount) {
      this.showPlayerCount = false;
    } else if (this.showGameModes) {
      this.showGameModes = false;
    }
  }

  togglePlayer(player: any) {
    // Si el jugador es el usuario logueado, no permitir removerlo
    if (player.id === this.loggedInUser?.id) {
      return;
    }

    const index = this.selectedPlayers.findIndex(p => p.id === player.id);
    if (index === -1) {
      this.selectedPlayers.push(player);
    } else {
      this.selectedPlayers.splice(index, 1);
    }
  }

  isPlayerSelected(player: any): boolean {
    return this.selectedPlayers.some(p => p.id === player.id);
  }
}