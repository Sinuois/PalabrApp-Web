import { Component, OnDestroy, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { TabNavComponent } from './components/tab-nav/tab-nav.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TabNavComponent, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  bloqueoNavegacionActivo = signal(false);
  private readonly bloqueoMs = 480;
  private timeoutBloqueo: number | null = null;
  private readonly removerRouterEventos: () => void;

  constructor(private router: Router) {
    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.activarBloqueoNavegacion();
        return;
      }

      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.programarDesactivacionBloqueo();
      }
    });

    this.removerRouterEventos = () => sub.unsubscribe();
  }

  onBloqueoNavegacion(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  ngOnDestroy(): void {
    if (this.timeoutBloqueo !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.timeoutBloqueo);
      this.timeoutBloqueo = null;
    }
    this.removerRouterEventos();
  }

  private activarBloqueoNavegacion(): void {
    this.bloqueoNavegacionActivo.set(true);
    if (this.timeoutBloqueo !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.timeoutBloqueo);
      this.timeoutBloqueo = null;
    }
  }

  private programarDesactivacionBloqueo(): void {
    if (typeof window === 'undefined') {
      this.bloqueoNavegacionActivo.set(false);
      return;
    }

    if (this.timeoutBloqueo !== null) {
      window.clearTimeout(this.timeoutBloqueo);
      this.timeoutBloqueo = null;
    }

    this.timeoutBloqueo = window.setTimeout(() => {
      this.bloqueoNavegacionActivo.set(false);
      this.timeoutBloqueo = null;
    }, this.bloqueoMs);
  }
}
