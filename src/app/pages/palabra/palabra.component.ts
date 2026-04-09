import { Component, OnInit, OnDestroy, signal, computed, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PalabrasService } from '../../services/palabras.service';
import { Palabra } from '../../interfaces/app.interfaces';

type Modo = 'view' | 'edit' | 'nueva';

@Component({
  selector: 'app-palabra',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './palabra.component.html',
  styleUrls: ['./palabra.component.scss']
})
export class PalabraComponent implements OnInit, OnDestroy {

  modo: Modo = 'nueva';
  palabra = signal<Palabra | null>(null);
  cargando = signal(true);

  concepto   = '';
  significado = '';

  buscandoRAE = signal(false);
  guardando   = signal(false);
  error       = signal('');
  mostrarModal = signal(false);
  conceptoEliminado = signal(false);

  private id = signal('');
  private touchStartX = 0;
  private touchStartY = 0;
  private swipeActivo = false;
  private touchMoveHandler!: (e: TouchEvent) => void;
  private routeSub!: Subscription;
  private redirectTimeoutId: number | null = null;

  private esErrorConceptoEliminado(err: any): boolean {
    const backendMsg = String(err?.error?.msg ?? '').toLowerCase();
    return err?.message === 'CONCEPTO_ELIMINADO'
      || backendMsg.includes('no existe')
      || backendMsg.includes('no encontrado')
      || backendMsg.includes('eliminad');
  }

  readonly indiceActual = computed(() =>
    this.palabrasService.palabrasOrdenadas().findIndex(p => p._id === this.id())
  );
  readonly anterior = computed(() => {
    const idx = this.indiceActual();
    const lista = this.palabrasService.palabrasOrdenadas();
    return idx > 0 ? lista[idx - 1] : null;
  });
  readonly siguiente = computed(() => {
    const idx = this.indiceActual();
    const lista = this.palabrasService.palabrasOrdenadas();
    return idx !== -1 && idx < lista.length - 1 ? lista[idx + 1] : null;
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public palabrasService: PalabrasService,
    private el: ElementRef<HTMLElement>
  ) {}

  async ngOnInit(): Promise<void> {
    // Non-passive touchmove blocks browser's native edge-swipe-back gesture
    this.touchMoveHandler = (e: TouchEvent) => {
      if (this.modo !== 'view' || !this.swipeActivo || this.mostrarModal()) return;
      const dx = Math.abs(e.touches[0].clientX - this.touchStartX);
      const dy = Math.abs(e.touches[0].clientY - this.touchStartY);
      if (dx > 10 && dx > dy) e.preventDefault();
    };
    this.el.nativeElement.addEventListener('touchmove', this.touchMoveHandler, { passive: false });

    // Subscribe to paramMap so re-navigation to same route triggers cargar()
    this.routeSub = this.route.paramMap.subscribe(params => {
      this.cargar(params.get('id') ?? '');
    });
  }

  private async cargar(id: string): Promise<void> {
    this.id.set(id);
    this.error.set('');
    this.conceptoEliminado.set(false);
    this.modo = id === 'nueva' ? 'nueva' : 'view';

    if (id === 'nueva') {
      this.cargando.set(false);
      return;
    }

    const state = history.state as { concepto?: string; significado?: string };
    if (state?.concepto) {
      this.palabra.set({ _id: id, concepto: state.concepto, significado: state.significado ?? '' });
      this.cargando.set(false);
    } else {
      this.cargando.set(true);
      try {
        const p = await this.palabrasService.getPalabra(id);
        this.palabra.set(p);
        this.modo = 'view';
      } catch {
        this.error.set('No se pudo cargar el concepto.');
      } finally {
        this.cargando.set(false);
      }
    }
  }

  async autocompletarDefinicion(): Promise<void> {
    if (!this.concepto.trim()) return;
    this.buscandoRAE.set(true);
    this.error.set('');
    const def = await this.palabrasService.buscarDefinicion(this.concepto.trim());
    if (def) {
      this.significado = def;
    } else {
      this.error.set('No se encontró definición para ese término.');
    }
    this.buscandoRAE.set(false);
  }

  async guardar(): Promise<void> {
    if (!this.concepto.trim() || !this.significado.trim()) {
      this.error.set('Completa el concepto y el significado.');
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    try {
      await this.palabrasService.crearPalabra(this.concepto, this.significado);
      await this.palabrasService.cargarPalabras();
      this.router.navigate(['/'], { replaceUrl: true });
    } catch (err: any) {
      this.error.set(err?.error?.msg ?? 'Error al guardar. Intenta de nuevo.');
      this.guardando.set(false);
    }
  }

  activarEdicion(): void {
    const p = this.palabra();
    if (!p) return;
    this.significado = p.significado;
    this.error.set('');
    this.modo = 'edit';
  }

  async guardarEdicion(): Promise<void> {
    const p = this.palabra();
    if (!p || !this.significado.trim()) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      await this.palabrasService.actualizarPalabra(p._id, this.significado);
      this.palabra.set({ ...p, significado: this.significado });
      await this.palabrasService.cargarPalabras();
      this.modo = 'view';
    } catch (err: any) {
      if (this.esErrorConceptoEliminado(err)) {
        this.marcarConceptoEliminado();
      } else {
        this.error.set('Error al actualizar.');
      }
    } finally {
      this.guardando.set(false);
    }
  }

  cancelarEdicion(): void {
    this.error.set('');
    this.modo = 'view';
  }

  pedirEliminar(): void {
    this.mostrarModal.set(true);
  }

  cancelarEliminar(): void {
    this.mostrarModal.set(false);
  }

  async confirmarEliminar(): Promise<void> {
    const p = this.palabra();
    if (!p) return;
    this.mostrarModal.set(false);
    this.guardando.set(true);
    try {
      await this.palabrasService.eliminarPalabra(p._id);
      await this.palabrasService.cargarPalabras();
      this.router.navigate(['/'], { replaceUrl: true });
    } catch (err: any) {
      this.guardando.set(false);
      if (this.esErrorConceptoEliminado(err)) {
        this.marcarConceptoEliminado();
      } else {
        this.error.set('Error al eliminar.');
      }
    }
  }

  private marcarConceptoEliminado(): void {
    this.error.set('');
    this.modo = 'view';
    this.palabra.set(null);
    this.conceptoEliminado.set(true);
    this.redirectTimeoutId = window.setTimeout(() => {
      this.router.navigate(['/'], { replaceUrl: true });
    }, 2500);
  }

  volver(): void {
    this.router.navigate(['/']);
  }

  private esObjetivoInteractivo(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && !!target.closest('button, a, input, textarea, select, label, [role="button"], [contenteditable="true"]');
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('touchmove', this.touchMoveHandler);
    this.routeSub?.unsubscribe();
    if (this.redirectTimeoutId !== null) {
      window.clearTimeout(this.redirectTimeoutId);
    }
  }

  onTouchStart(e: TouchEvent): void {
    if (this.modo !== 'view' || this.mostrarModal() || this.esObjetivoInteractivo(e.target)) {
      this.swipeActivo = false;
      return;
    }

    this.swipeActivo = true;
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  onTouchEnd(e: TouchEvent): void {
    if (!this.swipeActivo) return;

    this.swipeActivo = false;
    const delta = e.changedTouches[0].clientX - this.touchStartX;
    const UMBRAL = 60;
    if (delta < -UMBRAL) {
      const sig = this.siguiente();
      if (sig) this.navegarA(sig);
    } else if (delta > UMBRAL) {
      const ant = this.anterior();
      if (ant) this.navegarA(ant);
    }
  }

  irAnterior(): void {
    const p = this.anterior();
    if (p) this.navegarA(p);
  }

  irSiguiente(): void {
    const p = this.siguiente();
    if (p) this.navegarA(p);
  }

  navegarA(p: Palabra): void {
    this.router.navigate(['/palabra', p._id], {
      replaceUrl: true,
      state: { concepto: p.concepto, significado: p.significado }
    });
  }
}