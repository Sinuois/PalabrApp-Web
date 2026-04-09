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
    this.router.navigateByUrl('/');
  }

  goBuscar(): void {
    this.router.navigateByUrl('/buscar');
  }
}