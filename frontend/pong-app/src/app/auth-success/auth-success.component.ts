import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-auth-success',
  template: '<p>Authenticating...</p>',
})
export class AuthSuccessComponent implements OnInit {
  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const access = params['access'];
      const refresh = params['refresh'];

      if (access && refresh) {
        // Guardar tokens en localStorage
        localStorage.setItem('access_token', access);
        localStorage.setItem('refresh_token', refresh);

        // Redirigir al home o donde quieras
        this.router.navigate(['/home']);
      } else {
        this.router.navigate(['/auth-error']);
      }
    });
  }
}
