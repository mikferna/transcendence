import { Component, OnInit, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserSearchComponent } from '../user-search/user-search.component';
import { CommonModule } from '@angular/common';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, UserSearchComponent],
  animations: [
    trigger('menuAnimation', [
      state('closed', style({
        opacity: 0,
        transform: 'translateY(-10px) scale(0.95)',
        visibility: 'hidden'
      })),
      state('open', style({
        opacity: 1,
        transform: 'translateY(0) scale(1)',
        visibility: 'visible'
      })),
      transition('closed => open', [
        animate('200ms cubic-bezier(0.35, 0.1, 0.25, 1.0)')
      ]),
      transition('open => closed', [
        animate('150ms cubic-bezier(0.35, 0.1, 0.25, 1.0)')
      ])
    ])
  ]
})
export class HeaderComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  currentUser: any;
  showUserSearch: boolean = false;
  isProfileMenuOpen: boolean = false;
  isMenuOpen: boolean = false;
  showNotifications: boolean = false;
  gearRotation: number = 0;
  friendRequests: any[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private elementRef: ElementRef,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.loadFriendRequests();
      }
    });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    
    // Cerramos otros menús abiertos
    if (this.isMenuOpen) {
      this.isProfileMenuOpen = false;
      this.showNotifications = false;
      this.gearRotation = 90;
      document.body.classList.add('menu-open');
    } else {
      this.gearRotation = 0;
      document.body.classList.remove('menu-open');
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const targetElement = event.target as HTMLElement;
    const clickedInside = this.elementRef.nativeElement.contains(targetElement);
    
    if (!clickedInside) {
      this.closeAllMenus();
    }
  }

  onMenuClick(event: MouseEvent) {
    event.stopPropagation();
  }

  toggleProfileMenu(event: MouseEvent) {
    event.stopPropagation();
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    
    // Cerramos otros menús abiertos
    if (this.isProfileMenuOpen) {
      this.isMenuOpen = false;
      this.showNotifications = false;
      this.gearRotation = 0;
    }
  }

  toggleNotifications(event: MouseEvent) {
    event.stopPropagation();
    this.showNotifications = !this.showNotifications;
    
    // Cerramos otros menús abiertos
    if (this.showNotifications) {
      this.isMenuOpen = false;
      this.isProfileMenuOpen = false;
      this.gearRotation = 0;
      this.loadFriendRequests();
    }
  }

  closeAllMenus() {
    this.isMenuOpen = false;
    this.isProfileMenuOpen = false;
    this.showNotifications = false;
    this.gearRotation = 0;
    document.body.classList.remove('menu-open');
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
    this.closeAllMenus();
  }

  navigateToProfile() {
    if (this.currentUser && this.currentUser.username) {
      this.router.navigate(['/profile', this.currentUser.username]);
      this.closeAllMenus();
    } else {
      console.error('No se pudo obtener el nombre de usuario actual');
    }
  }

  openUserSearch() {
    this.showUserSearch = true;
    this.closeAllMenus();
  }

  closeUserSearch() {
    this.showUserSearch = false;
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
        this.closeAllMenus();
      },
      error: (error) => {
        console.error('Error al cerrar sesión:', error);
        // Aún así intentamos navegar a la página de login
        this.router.navigate(['/login']);
        this.closeAllMenus();
      }
    });
  }

  getAbsoluteAvatarUrl(avatarUrl: string): string {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `${environment.apiUrl}${avatarUrl}`;
  }

  loadFriendRequests() {
    this.http.get(`${environment.apiUrl}/friend-requests/list/`).subscribe({
      next: (data: any) => {
        this.friendRequests = data;
      },
      error: (error) => {
        console.error('Error al cargar solicitudes de amistad:', error);
      }
    });
  }

  acceptFriendRequest(requestId: number) {
    this.http.post(`${environment.apiUrl}/friend-requests/accept/${requestId}/`, {}).subscribe({
      next: () => {
        this.loadFriendRequests();
      },
      error: (error) => {
        console.error('Error al aceptar solicitud:', error);
      }
    });
  }

  declineFriendRequest(requestId: number) {
    this.http.post(`${environment.apiUrl}/friend-requests/decline/${requestId}/`, {}).subscribe({
      next: () => {
        this.loadFriendRequests();
      },
      error: (error) => {
        console.error('Error al rechazar solicitud:', error);
      }
    });
  }
}