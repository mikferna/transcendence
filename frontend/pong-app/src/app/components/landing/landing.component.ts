import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent {
  
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}
  
  login(): void {
    // Display loading screen (communication happens through service)
    const loadingScreenElement = document.querySelector('.loading-screen') as HTMLElement;
    if (loadingScreenElement) {
      loadingScreenElement.style.display = 'flex';
    }
    
    // Navigate to home after delay
    setTimeout(() => {
      if (loadingScreenElement) {
        loadingScreenElement.style.display = 'none';
      }
      this.router.navigate(['/login']);
    }, 2000);
  }

  login42(): void {
  
    try {
      const loadingScreenElement = document.querySelector('.loading-screen') as HTMLElement;
      if (loadingScreenElement) {
        loadingScreenElement.style.display = 'flex';
      }

      localStorage.removeItem('ft_api_token');
      localStorage.removeItem('is_42_user');
            
      const timestamp = new Date().getTime();
      window.location.href = `${environment.apiUrl}/auth/authorize/?force_verify=true&t=${timestamp}`;
    } catch (error) {
    }
  }
}