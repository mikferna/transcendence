import { Component, OnInit, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserSearchComponent } from '../user-search/user-search.component';
import { CommonModule } from '@angular/common';
import { trigger, state, style, animate, transition } from '@angular/animations';

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
  gearRotation: number = 0;

  constructor(
    private router: Router,
    private authService: AuthService,
    private elementRef: ElementRef
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    
    // Si estamos abriendo el menú principal, cerramos el menú de perfil
    if (this.isMenuOpen) {
      this.isProfileMenuOpen = false;
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
    // Detener la propagación para evitar que el evento llegue al document
    event.stopPropagation();
    // Alternar el estado del menú de perfil
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeAllMenus() {
    this.isMenuOpen = false;
    this.isProfileMenuOpen = false;
    this.gearRotation = 0;
    document.body.classList.remove('menu-open');
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
    this.closeAllMenus();
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
    return `http://localhost:8000${avatarUrl}`;
  }
}