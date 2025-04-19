import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule, Routes } from '@angular/router';

import { TournamentComponent } from './tournament.component';
import { MatchService } from '../../services/match.service';

const routes: Routes = [
  { path: '', component: TournamentComponent }
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    RouterModule.forChild(routes),
    TournamentComponent // Importado directamente porque es un componente standalone
  ],
  providers: [
    MatchService
  ]
})
export class TournamentModule { }