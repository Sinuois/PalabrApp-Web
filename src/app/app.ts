import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TabNavComponent } from './components/tab-nav/tab-nav.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TabNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
