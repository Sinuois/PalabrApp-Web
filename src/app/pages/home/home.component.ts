import { ChangeDetectionStrategy, Component, HostListener, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PalabrasService, Orden } from '../../services/palabras.service';
import { GameUtilsService } from '../../services/game-utils.service';
import { TriviaService } from '../../services/trivia.service';
import { AhorcadoService } from '../../services/ahorcado.service';
import { CrucigramaService, CrucigramaCelda } from '../../services/crucigrama.service';
import { SopaCelda, SopaService, SopaPalabra } from '../../services/sopa.service';
import { Palabra } from '../../interfaces/app.interfaces';

type TipoJuego = 'trivia' | 'ahorcado' | 'crucigrama' | 'sopa';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit {

  Math = Math;

  // UI Orchestration state (only what component manages)
  isRefreshing = signal(false);
  errorCarga = signal(false);
  mostrarInvitacionJuego = signal(true);
  juegoActivo = signal(false);
  juegoCargando = signal(false);
  tipoJuego = signal<TipoJuego>('trivia');
  mensajeJuego = signal('');
  mostrarCelebracion = signal(false);
  cargandoAceptarInvitacion = signal(false);
  cargandoInicioJuego = signal(false);
  cargandoOtroJuego = signal(false);
  navegandoBuscar = signal(false);
  navegandoNuevaPalabra = signal(false);
  sopaArrastrando = false;
  sopaUltimaCeldaArrastre: string | null = null;
  sopaArrastreTuvoMovimiento = false;
  sopaIgnorarSiguienteClick = false;
  sopaPrimerToque: SopaCelda | null = null;
  sopaRutaInvalida = signal<Array<{ f: number; c: number }>>([]);
  private listaTouchInicioX = 0;
  private listaTouchInicioY = 0;
  private listaTouchSeMovio = false;
  private listaIgnorarClicksHasta = 0;
  private sopaTimerRutaInvalida: number | null = null;
  private ultimoTapTouchMs = 0;
  private ultimoTapTouchTarget: EventTarget | null = null;
  private readonly ventanaIgnorarClickMs = 700;
  private ultimoCambioOrdenMs = 0;
  private juegoAbriendoHasta = 0;

  get orden()            { return this.palabrasService.orden; }
  get palabrasOrdenadas(){ return this.palabrasService.palabrasOrdenadas; }
  get cantPalabras()     { return this.palabrasService.cantPalabras(); }
  get cargado()          { return this.palabrasService.cargado(); }

  constructor(
    private palabrasService: PalabrasService,
    private router: Router,
    public triviaService: TriviaService,
    public ahorcadoService: AhorcadoService,
    public crucigramaService: CrucigramaService,
    public sopaService: SopaService,
    private gameUtils: GameUtilsService
  ) {}

  ngOnInit(): void {
    // Mostrar invitación solo una vez por sesión (solo en navegador)
    if (this.leerJuegoPresentadoEnSesion()) {
      this.mostrarInvitacionJuego.set(false);
    }
    this.precalentarRutasSecundarias();
    this.refrescar();
  }

  async refrescar(): Promise<void> {
    if (this.isRefreshing()) return;

    this.isRefreshing.set(true);
    this.errorCarga.set(false);
    try {
      await this.palabrasService.cargarPalabras();
    } catch {
      this.errorCarga.set(true);
    } finally {
      this.isRefreshing.set(false);
    }
  }

  ciclarOrden(): void {
    const ciclo: Orden[] = ['Abc', 'New', 'Zyx'];
    const idx = ciclo.indexOf(this.palabrasService.orden());
    this.palabrasService.orden.set(ciclo[(idx + 1) % ciclo.length]);
  }

  onCiclarOrdenTap(event: Event): void {
    const ahora = Date.now();
    const esClick = event.type === 'click';

    if (esClick && ahora - this.ultimoCambioOrdenMs < 650) return;
    if (!esClick && ahora - this.ultimoCambioOrdenMs < 120) return;

    this.ultimoCambioOrdenMs = ahora;
    this.ciclarOrden();
  }

  irABuscar(): void {
    if (this.navegandoBuscar()) return;

    this.navegandoBuscar.set(true);
    void this.router.navigateByUrl('/buscar')
      .finally(() => this.navegandoBuscar.set(false));
  }

  onBuscarTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.irABuscar());
  }

  verPalabra(p: Palabra): void {
    this.router.navigate(['/palabra', p._id], {
      state: { concepto: p.concepto, significado: p.significado }
    });
  }

  onVerPalabraTap(event: Event, p: Palabra): void {
    if (Date.now() < this.listaIgnorarClicksHasta) return;

    if ((event.type === 'touchend' || event.type === 'pointerup') && this.listaTouchSeMovio) {
      this.listaIgnorarClicksHasta = Date.now() + 550;
      return;
    }

    this.ejecutarTapSeguro(event, () => this.verPalabra(p));

    if (event.type === 'touchend' || event.type === 'pointerup') {
      this.listaIgnorarClicksHasta = Date.now() + 450;
    }
  }

  onListaTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;

    this.listaTouchInicioX = touch.clientX;
    this.listaTouchInicioY = touch.clientY;
    this.listaTouchSeMovio = false;
  }

  onListaTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;

    const dx = Math.abs(touch.clientX - this.listaTouchInicioX);
    const dy = Math.abs(touch.clientY - this.listaTouchInicioY);
    if (dx > 8 || dy > 8) {
      this.listaTouchSeMovio = true;
      this.listaIgnorarClicksHasta = Date.now() + 420;
    }
  }

  onListaTouchEnd(): void {
    if (!this.listaTouchSeMovio) return;
    this.listaIgnorarClicksHasta = Date.now() + 550;
  }

  nuevaPalabra(): void {
    if (this.navegandoNuevaPalabra()) return;

    this.navegandoNuevaPalabra.set(true);
    void this.router.navigate(['/palabra/nueva'])
      .finally(() => this.navegandoNuevaPalabra.set(false));
  }

  onNuevaPalabraTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.nuevaPalabra());
  }

  cerrarInvitacionJuego(): void {
    this.mostrarInvitacionJuego.set(false);
    this.marcarJuegoPresentadoEnSesion();
  }

  onCerrarInvitacionTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.cerrarInvitacionJuego());
  }

  async aceptarInvitacionJuego(): Promise<void> {
    if (this.cargandoAceptarInvitacion()) return;

    this.cargandoAceptarInvitacion.set(true);

    try {
      // Asegurarse de que las palabras estén cargadas
      if (!this.palabrasService.cargado()) {
        await this.palabrasService.cargarPalabras();
      }

      this.mostrarInvitacionJuego.set(false);
      this.juegoActivo.set(true);
      this.marcarJuegoPresentadoEnSesion();

      await this.prepararJuego();
    } finally {
      this.cargandoAceptarInvitacion.set(false);
    }
  }

  onAceptarInvitacionTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => {
      void this.aceptarInvitacionJuego();
    });
  }

  async iniciarJuegoDirecto(): Promise<void> {
    if (this.cargandoInicioJuego()) return;

    this.cargandoInicioJuego.set(true);
    this.juegoActivo.set(true);
    this.juegoAbriendoHasta = Date.now() + 300; // Bloquear eventos de juego durante 300ms

    try {
      await this.prepararJuego();
    } finally {
      this.cargandoInicioJuego.set(false);
    }
  }

  onIniciarJuegoDirectoTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => {
      void this.iniciarJuegoDirecto();
    });
  }

  cerrarJuego(): void {
    this.juegoActivo.set(false);
    this.juegoCargando.set(false);
    this.tipoJuego.set('trivia');
    this.mensajeJuego.set('');
    this.cargandoInicioJuego.set(false);
    this.cargandoAceptarInvitacion.set(false);
    this.cargandoOtroJuego.set(false);
    this.triviaService.resetear();
    this.ahorcadoService.resetear();
    this.crucigramaService.resetear();
    this.sopaService.resetear();
    this.limpiarRutaInvalidaSopa();
  }

  async jugarOtra(): Promise<void> {
    if (this.cargandoOtroJuego()) return;

    this.cargandoOtroJuego.set(true);
    this.juegoAbriendoHasta = Date.now() + 300; // Bloquear eventos de juego durante 300ms
    try {
      await this.prepararJuego(this.tipoJuego());
    } finally {
      this.cargandoOtroJuego.set(false);
    }
  }

  onJugarOtraTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => {
      void this.jugarOtra();
    });
  }

  onCerrarJuegoTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.cerrarJuego());
  }

  onRevisarCrucigramaTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.revisarCrucigrama());
  }

  resolverOpcion(indice: number): void {
    if (this.triviaService.indiceSeleccionado() !== null) return;

    const gano = this.triviaService.resolverOpcion(indice);
    if (gano) {
      this.mostrarCelebracion.set(true);
      this.mensajeJuego.set('¡Felicitaciones! Tómale captura a esto y mándaselo a Gonzalo. ¡Lo harás muy feliz!');
      setTimeout(() => this.mostrarCelebracion.set(false), 3000);
      return;
    }

    this.mensajeJuego.set('Para la otra será, compa. Aunque Gonzalo dice que deberías pasar más tiempo en PalabrApp.');
  }

  onResolverOpcionTap(event: Event, indice: number): void {
    this.ejecutarTapSeguro(event, () => this.resolverOpcion(indice));
  }

  claseOpcion(indice: number): string {
    return this.triviaService.claseOpcion(indice);
  }

  private async prepararJuego(excluirTipo?: TipoJuego): Promise<void> {
    this.mensajeJuego.set('');
    this.mostrarCelebracion.set(false);

    const tipos: TipoJuego[] = ['trivia', 'ahorcado', 'crucigrama', 'sopa'];
    const tiposDisponibles = excluirTipo ? tipos.filter(t => t !== excluirTipo) : tipos;
    const tipoAleatorio = tiposDisponibles[Math.floor(Math.random() * tiposDisponibles.length)];
    this.tipoJuego.set(tipoAleatorio);

    if (tipoAleatorio === 'trivia') {
      await this.prepararTrivia();
      return;
    }

    if (tipoAleatorio === 'ahorcado') {
      await this.prepararAhorcado();
      return;
    }

    if (tipoAleatorio === 'crucigrama') {
      await this.prepararCrucigrama();
      return;
    }

    await this.prepararSopaLetras();
  }

  private async prepararTrivia(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();

    if (!this.palabrasService.cargado()) {
      try {
        await this.palabrasService.cargarPalabras();
      } catch {
        this.mensajeJuego.set('No se pudo cargar el juego en este momento.');
        this.juegoCargando.set(false);
        return;
      }
    }

    const todas = this.palabrasService.palabras();
    const candidatas = this.triviaService.filtrarCandidatos(todas);

    if (candidatas.length < 3) {
      this.mensajeJuego.set('Aún no hay suficientes conceptos con significado corto para jugar.');
      this.juegoCargando.set(false);
      return;
    }

    const exito = this.triviaService.generar(candidatas);
    if (!exito) {
      this.mensajeJuego.set('No se pudieron generar alternativas suficientes para jugar.');
    }

    this.juegoCargando.set(false);
  }

  private async prepararAhorcado(): Promise<void> {
    this.juegoCargando.set(true);
    this.ahorcadoService.resetear();

    if (!this.palabrasService.cargado()) {
      try {
        await this.palabrasService.cargarPalabras();
      } catch {
        this.mensajeJuego.set('No se pudo cargar el juego en este momento.');
        this.juegoCargando.set(false);
        return;
      }
    }

    const todas = this.palabrasService.palabras();
    const candidatas = this.ahorcadoService.filtrarCandidatos(todas);

    if (candidatas.length < 1) {
      this.mensajeJuego.set('No hay conceptos disponibles para el ahorcado en este momento.');
      this.juegoCargando.set(false);
      return;
    }

    const exito = this.ahorcadoService.generar(candidatas);
    if (!exito) {
      this.mensajeJuego.set('No se pudo generar el ahorcado en este momento.');
    }

    this.juegoCargando.set(false);
  }

  adivinarLetraAhorcado(letra: string): void {
    this.ahorcadoService.adivinarLetra(letra);
    const { gano, perdio } = this.ahorcadoService.verificarEstado();

    if (gano) {
      this.mostrarCelebracion.set(true);
      this.mensajeJuego.set('¡Lo adivinaste! Tómale captura a esto y mándaselo a Gonzalo. ¡Lo harás muy feliz!');
      setTimeout(() => this.mostrarCelebracion.set(false), 3000);
      return;
    }

    if (perdio) {
      this.mensajeJuego.set(`Perdiste. La palabra era: ${this.ahorcadoService.palabraAhorcado()}`);
    }
  }

  onAdivinarLetraAhorcadoTap(event: Event, letra: string): void {
    this.ejecutarTapSeguro(event, () => this.adivinarLetraAhorcado(letra));
  }

  private async prepararCrucigrama(): Promise<void> {
    this.juegoCargando.set(true);
    this.resetearScrollJuego();
    this.crucigramaService.resetear();

    if (!this.palabrasService.cargado()) {
      try {
        await this.palabrasService.cargarPalabras();
      } catch {
        this.mensajeJuego.set('No se pudo cargar el juego en este momento.');
        this.juegoCargando.set(false);
        return;
      }
    }

    const todas = this.palabrasService.palabras();
    const candidatas = this.crucigramaService.filtrarCandidatos(todas);

    if (candidatas.length < 6) {
      this.mensajeJuego.set('Aún no hay suficientes conceptos para generar un crucigrama.');
      this.juegoCargando.set(false);
      return;
    }

    const exito = this.crucigramaService.generar(candidatas);
    if (!exito) {
      this.mensajeJuego.set('No se pudo generar un crucigrama en este intento. Prueba otro concepto.');
    }

    this.juegoCargando.set(false);
    this.resetearScrollJuego();
  }

  actualizarCeldaCrucigrama(key: string, valor: string): void {
    if (this.crucigramaService.crucigramaResuelto()) return;

    const celda = this.crucigramaService.crucigramaGrid().flat().find((c: CrucigramaCelda) => c.key === key);
    if (celda?.fijaDesdeInicio) return;

    this.crucigramaService.actualizarCeldaCrucigrama(key, valor);
    if (valor) {
      setTimeout(() => this.enfocarSiguienteCeldaCrucigrama(key), 0);
    }
  }

  enfocarSiguienteCeldaCrucigrama(key: string): void {
    const siguiente = this.crucigramaService.enfocarSiguienteCeldaCrucigrama(key, this.obtenerDireccionCrucigrama(key));
    if (siguiente !== key) {
      this.enfocarCeldaCrucigramaPorKey(siguiente);
    }
  }

  private obtenerDireccionCrucigrama(key: string): 'h' | 'v' {
    return this.crucigramaService.obtenerDireccionAvanceCrucigrama(key);
  }

  revisarCrucigrama(): void {
    const correcto = this.crucigramaService.revisarCrucigrama();
    if (!correcto) {
      this.mensajeJuego.set('Hay letras incorrectas. Ajusta y vuelve a revisar.');
      return;
    }

    this.mostrarCelebracion.set(true);
    this.mensajeJuego.set('¡Crucigrama resuelto! Tómale captura y mándaselo a Gonzalo.');
    setTimeout(() => this.mostrarCelebracion.set(false), 3000);
  }

  private enfocarCeldaCrucigramaPorKey(key: string): void {
    if (typeof document === 'undefined') return;

    const selector = `input.crossword-input[data-cell-key="${key}"]`;
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input) return;

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  private resetearScrollJuego(): void {
    if (typeof document === 'undefined') return;

    setTimeout(() => {
      const modal = document.querySelector<HTMLElement>('.game-modal');
      const overlay = document.querySelector<HTMLElement>('.game-modal-overlay');
      modal?.scrollTo({ top: 0, behavior: 'auto' });
      overlay?.scrollTo({ top: 0, behavior: 'auto' });
    }, 0);
  }

  private async prepararSopaLetras(): Promise<void> {
    this.juegoCargando.set(true);
    this.sopaService.resetear();
    this.sopaPrimerToque = null;
    this.limpiarRutaInvalidaSopa();
    this.mensajeJuego.set('Ojo que hay palabras horizontales, verticales, diagonales e inversas.');

    if (!this.palabrasService.cargado()) {
      try {
        await this.palabrasService.cargarPalabras();
      } catch {
        this.mensajeJuego.set('No se pudo cargar el juego en este momento.');
        this.juegoCargando.set(false);
        return;
      }
    }

    const todas = this.palabrasService.palabras();
    const candidatas = this.sopaService.filtrarCandidatos(todas);

    if (candidatas.length < 6) {
      this.mensajeJuego.set('Aún no hay suficientes conceptos para generar la sopa de letras.');
      this.juegoCargando.set(false);
      return;
    }

    const exito = this.sopaService.generar(candidatas);
    if (!exito) {
      this.mensajeJuego.set('No se pudo generar la sopa en este intento. Prueba otro juego.');
    }

    this.juegoCargando.set(false);
    this.resetearScrollJuego();
  }

  iniciarArrastreSopa(fila: number, col: number): void {
    if (this.juegoCargando() || this.sopaPalabrasCompletadas()) return;

    this.sopaArrastrando = true;
    this.sopaArrastreTuvoMovimiento = false;
    this.sopaUltimaCeldaArrastre = `${fila}-${col}`;
    this.sopaService.sopaSeleccionInicio.set({ f: fila, c: col });
    this.sopaService.sopaSeleccionFin.set(null);
    this.sopaService.sopaRutaSeleccion.set([{ f: fila, c: col }]);
  }

  actualizarArrastreSopa(fila: number, col: number): void {
    if (!this.sopaArrastrando) return;

    const key = `${fila}-${col}`;
    if (this.sopaUltimaCeldaArrastre === key) return;

    this.sopaArrastreTuvoMovimiento = true;
    this.sopaUltimaCeldaArrastre = key;
    this.sopaService.seleccionarCeldaSopa(fila, col);
  }

  finalizarArrastreSopa(): void {
    if (!this.sopaArrastrando) return;

    const huboMovimiento = this.sopaArrastreTuvoMovimiento;

    this.sopaArrastrando = false;
    this.sopaArrastreTuvoMovimiento = false;
    this.sopaUltimaCeldaArrastre = null;
    if (huboMovimiento) {
      this.sopaIgnorarSiguienteClick = true;
      this.sopaPrimerToque = null;
    } else {
      if (this.sopaPrimerToque) {
        this.sopaService.sopaSeleccionInicio.set({ ...this.sopaPrimerToque });
        this.sopaService.sopaSeleccionFin.set(null);
        this.sopaService.sopaRutaSeleccion.set([{ ...this.sopaPrimerToque }]);
      } else {
        this.sopaService.sopaSeleccionInicio.set(null);
        this.sopaService.sopaSeleccionFin.set(null);
        this.sopaService.sopaRutaSeleccion.set([]);
      }
      return;
    }

    const ruta = this.sopaService.sopaRutaSeleccion();
    this.procesarSeleccionSopa(ruta);
  }

  cancelarArrastreSopa(): void {
    if (!this.sopaArrastrando) return;
    this.finalizarArrastreSopa();
  }

  onSopaPointerMove(event: PointerEvent): void {
    if (!this.sopaArrastrando) return;

    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    if (!target) return;

    const celda = target.closest('.sopa-cell') as HTMLElement | null;
    if (!celda) return;

    const fila = Number(celda.dataset['fila']);
    const columna = Number(celda.dataset['columna']);
    if (!Number.isInteger(fila) || !Number.isInteger(columna)) return;

    this.actualizarArrastreSopa(fila, columna);
  }

  onClickCeldaSopa(fila: number, col: number): void {
    if (this.sopaIgnorarSiguienteClick) {
      this.sopaIgnorarSiguienteClick = false;
      return;
    }

    if (this.juegoCargando() || this.sopaPalabrasCompletadas()) return;

    const inicio = this.sopaPrimerToque;
    if (!inicio || (inicio.f === fila && inicio.c === col)) {
      this.sopaPrimerToque = { f: fila, c: col };
      this.sopaService.sopaSeleccionInicio.set({ ...this.sopaPrimerToque });
      this.sopaService.sopaSeleccionFin.set(null);
      this.sopaService.sopaRutaSeleccion.set([{ ...this.sopaPrimerToque }]);
      return;
    }

    this.sopaService.sopaSeleccionInicio.set({ ...inicio });
    this.sopaService.seleccionarCeldaSopa(fila, col);
    const ruta = this.sopaService.sopaRutaSeleccion();
    this.procesarSeleccionSopa(ruta);
  }

  @HostListener('window:pointerup')
  onPointerUpGlobal(): void {
    if (!this.sopaArrastrando) return;
    this.finalizarArrastreSopa();
  }

  @HostListener('window:pointercancel')
  onPointerCancelGlobal(): void {
    if (!this.sopaArrastrando) return;
    this.cancelarArrastreSopa();
  }

  private sopaValidarRuta(ruta: Array<{ f: number; c: number }>): boolean {
    if (ruta.length <= 1) return true;
    const f1 = ruta[0].f, c1 = ruta[0].c;
    const f2 = ruta[1].f, c2 = ruta[1].c;
    const dr = f2 - f1, dc = c2 - c1;

    for (let i = 1; i < ruta.length; i++) {
      if (ruta[i].f - ruta[i - 1].f !== dr || ruta[i].c - ruta[i - 1].c !== dc) {
        return false;
      }
    }
    return true;
  }

  private procesarSeleccionSopa(ruta: Array<{ f: number; c: number }>): void {
    this.sopaPrimerToque = null;

    const reglaSeleccion = 'La selección de letras solo puede ser una recta horizontal, vertical o diagonal.';

    if (ruta.length < 2) {
      const inicio = this.sopaService.sopaSeleccionInicio();
      const fin = this.sopaService.sopaSeleccionFin();
      if (inicio && fin && (inicio.f !== fin.f || inicio.c !== fin.c)) {
        this.marcarRutaInvalidaTemporal([inicio, fin]);
        this.mensajeJuego.set(reglaSeleccion);
      }

      this.sopaService.sopaSeleccionInicio.set(null);
      this.sopaService.sopaSeleccionFin.set(null);
      this.sopaService.sopaRutaSeleccion.set([]);
      return;
    }

    if (!this.sopaValidarRuta(ruta)) {
      this.marcarRutaInvalidaTemporal(ruta);
      this.sopaService.sopaSeleccionInicio.set(null);
      this.sopaService.sopaSeleccionFin.set(null);
      this.sopaService.sopaRutaSeleccion.set([]);
      this.mensajeJuego.set(reglaSeleccion);
      return;
    }

    this.resolverSeleccionSopa(ruta);
    this.sopaService.sopaSeleccionInicio.set(null);
    this.sopaService.sopaSeleccionFin.set(null);
    this.sopaService.sopaRutaSeleccion.set([]);
  }

  seleccionarPalabraSopa(id: string): void {
    this.sopaService.seleccionarPalabraSopa(id);
  }

  palabraSopaEncontrada(id: string): boolean {
    return this.sopaService.sopaEncontradas().has(id);
  }

  sopaPalabrasCompletadas(): boolean {
    const palabras = this.sopaService.sopaPalabras();
    const encontradas = this.sopaService.sopaEncontradas();
    return palabras.length > 0 && encontradas.size === palabras.length;
  }

  private resolverSeleccionSopa(ruta: Array<{ f: number; c: number }>): void {
    const exito = this.sopaService.resolverSeleccionSopa(ruta);
    
    if (!exito) {
      this.marcarRutaInvalidaTemporal(ruta);
      this.mensajeJuego.set('Esa selección no corresponde a una palabra objetivo.');
      return;
    }

    const total = this.sopaService.sopaPalabras().length;
    const halladas = this.sopaService.sopaEncontradas().size;

    if (halladas >= total) {
      this.mostrarCelebracion.set(true);
      this.mensajeJuego.set('¡Sopa completada! Tómale captura y mándaselo a Gonzalo.');
      setTimeout(() => this.mostrarCelebracion.set(false), 3000);
      return;
    }

    this.mensajeJuego.set(`¡Bien! Llevas ${halladas}/${total} palabras.`);
  }
  // Sopa helper methods for template
  valorCeldaCrucigrama(key: string): string {
    return this.crucigramaService.crucigramaRespuestas().get(key) ?? '';
  }

  esCeldaSopaSeleccionada(key: string): boolean {
    const [f, c] = key.split('-').map(Number);
    return this.sopaService.sopaRutaSeleccion().some(p => p.f === f && p.c === c);
  }

  esCeldaSopaEncontrada(key: string): boolean {
    const encontradas = this.sopaService.sopaEncontradas();
    const [f, c] = key.split('-').map(Number);
    return this.sopaService.sopaPalabras().some(p => 
      encontradas.has(p.id) && p.path.some(pos => pos.f === f && pos.c === c)
    );
  }

  esCeldaSopaInvalida(key: string): boolean {
    const [f, c] = key.split('-').map(Number);
    return this.sopaRutaInvalida().some(p => p.f === f && p.c === c);
  }

  palabraSopaSeleccionada(id: string): boolean {
    return this.sopaService.sopaPalabraSeleccionadaId() === id;
  }

  significadoSopaSeleccionado(): string {
    const id = this.sopaService.sopaPalabraSeleccionadaId();
    if (!id) return '';
    return this.sopaService.sopaPalabras().find(p => p.id === id)?.significado ?? '';
  }

  onFocusCeldaCrucigrama(_key: string, event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    input?.select();
  }

  trackById(_: number, p: Palabra) { return p._id; }

  private marcarRutaInvalidaTemporal(ruta: Array<{ f: number; c: number }>): void {
    this.sopaRutaInvalida.set([...ruta]);

    if (this.sopaTimerRutaInvalida !== null) {
      clearTimeout(this.sopaTimerRutaInvalida);
    }

    this.sopaTimerRutaInvalida = window.setTimeout(() => {
      this.sopaRutaInvalida.set([]);
      this.sopaTimerRutaInvalida = null;
    }, 450);
  }

  private limpiarRutaInvalidaSopa(): void {
    this.sopaRutaInvalida.set([]);
    if (this.sopaTimerRutaInvalida !== null) {
      clearTimeout(this.sopaTimerRutaInvalida);
      this.sopaTimerRutaInvalida = null;
    }
  }

  private ejecutarTapSeguro(event: Event, accion: () => void): void {
    // NO procesar eventos en inputs del crucigrama (necesitan propagación normal)
    if (event.target instanceof HTMLInputElement && event.target.classList.contains('crossword-input')) {
      accion();
      return;
    }

    // Consumir el evento para evitar propagación a elementos subyacentes
    event.stopPropagation();
    if (event instanceof PointerEvent || event instanceof TouchEvent || event instanceof MouseEvent) {
      event.preventDefault();
    }

    // Si estamos en ventana de apertura de juego, bloquear acciones dentro del modal del juego
    if (this.juegoAbriendoHasta > Date.now() && this.juegoActivo()) {
      const target = event.target;
      if (target instanceof Element) {
        // Bloquear si el toque está en elementos del juego
        if (target.closest('[game-button]') || 
            target.closest('.game-modal') || 
            target.closest('[trivia-option]') ||
            target.closest('[hangman-letter]')) {
          return;
        }
      }
    }

    const esTapPrimario = event.type === 'touchend' || event.type === 'pointerup';

    if (esTapPrimario) {
      this.ultimoTapTouchMs = Date.now();
      this.ultimoTapTouchTarget = event.target;
      accion();
      return;
    }

    const clickReciente = Date.now() - this.ultimoTapTouchMs < this.ventanaIgnorarClickMs;
    const mismoObjetivo = this.esMismoObjetivoTap(event.target, this.ultimoTapTouchTarget);
    if (clickReciente && mismoObjetivo) {
      return;
    }

    accion();
  }

  private esMismoObjetivoTap(actual: EventTarget | null, previo: EventTarget | null): boolean {
    if (!(actual instanceof Element) || !(previo instanceof Element)) {
      return false;
    }

    return actual === previo || actual.contains(previo) || previo.contains(actual);
  }

  private leerJuegoPresentadoEnSesion(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.sessionStorage.getItem('juegoPresentado'));
    } catch {
      return false;
    }
  }

  private marcarJuegoPresentadoEnSesion(): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem('juegoPresentado', 'true');
    } catch {
      // Algunos Safari/iOS pueden bloquear storage; no debe romper la UI.
    }
  }

  private precalentarRutasSecundarias(): void {
    if (typeof window === 'undefined') return;

    void import('../buscar/buscar.component');
    void import('../palabra/palabra.component');
  }
}