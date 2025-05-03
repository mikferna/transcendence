import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// Components
import { LandingComponent } from './components/landing/landing.component';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { GameModeSelectorComponent } from './components/game-mode-selector/game-mode-selector.component';
import { LoadingScreenComponent } from './components/loading-screen/loading-screen.component';
import { HomeComponent } from './components/home/home.component';
import { LoginComponent } from './login/login.component';
import { UserSettingsComponent } from './components/user-settings/user-settings.component';
import { UserSearchComponent } from './components/user-search/user-search.component';
//import { AuthSuccessComponent } from './auth-success/auth-success.component';
import { TournamentComponent } from './components/tournament/tournament.component';

// Services
import { MatrixService } from './services/matrix.service';
import { AuthService } from './services/auth.service';
// Importamos nuestro nuevo AuthInterceptor en lugar del HttpInterceptorService
import { AuthInterceptor } from './services/auth.interceptor';
import { TokenService } from './services/token.service';

@NgModule({
  declarations: [
    AppComponent,
  //  AuthSuccessComponent,
    LandingComponent,
    FooterComponent,
    GameModeSelectorComponent,
    LoadingScreenComponent,
    HomeComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    ReactiveFormsModule,
    AppRoutingModule,
    LoginComponent,
    UserSettingsComponent,
    UserSearchComponent,
    HeaderComponent,
    TournamentComponent
  ],
  providers: [
    MatrixService,
    AuthService,
    TokenService, // Añadimos el TokenService a los providers
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor, // Usamos AuthInterceptor en lugar de HttpInterceptorService
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }