import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule, Routes } from '@angular/router';

import { MatchComponent } from './match.component';
import { MatchService } from '../../services/match.service';

const routes: Routes = [
  { path: '', component: MatchComponent }
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    RouterModule.forChild(routes),
    MatchComponent // Importado directamente porque es un componente standalone
  ],
  providers: [
    MatchService
  ]
})
export class MatchModule { }