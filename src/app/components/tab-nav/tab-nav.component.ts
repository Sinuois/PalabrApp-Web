import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-tab-nav',
  standalone: true,
  templateUrl: './tab-nav.component.html',
  styleUrls: ['./tab-nav.component.scss']
})
export class TabNavComponent {
  private readonly router = inject(Router);
  private ultimoTapTouchMs = 0;
  private readonly ventanaIgnorarClickMs = 700;
  private navegandoHome = false;
  private navegandoBuscar = false;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  readonly isHomeActive = computed(() => this.currentUrl() === '/');
  readonly isBuscarActive = computed(() => this.currentUrl().startsWith('/buscar'));

  goHome(): void {
    if (this.navegandoHome) return;

    this.navegandoHome = true;
    void this.router.navigateByUrl('/')
      .finally(() => {
        this.navegandoHome = false;
      });
  }

  goBuscar(): void {
    if (this.navegandoBuscar) return;

    this.navegandoBuscar = true;
    void this.router.navigateByUrl('/buscar')
      .finally(() => {
        this.navegandoBuscar = false;
      });
  }

  onGoHomeTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.goHome());
  }

  onGoBuscarTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.goBuscar());
  }

  private ejecutarTapSeguro(event: Event, accion: () => void): void {
    const esTapPrimario = event.type === 'touchend' || event.type === 'pointerup';

    if (esTapPrimario) {
      this.ultimoTapTouchMs = Date.now();
      accion();
      return;
    }

    if (Date.now() - this.ultimoTapTouchMs < this.ventanaIgnorarClickMs) {
      return;
    }

    accion();
  }
}