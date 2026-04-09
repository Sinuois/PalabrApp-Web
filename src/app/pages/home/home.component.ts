import { Component, HostListener, OnInit, signal } from '@angular/core';
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
  styleUrls: ['./home.component.scss']
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
  sopaArrastrando = false;
  sopaUltimaCeldaArrastre: string | null = null;
  sopaArrastreTuvoMovimiento = false;
  sopaIgnorarSiguienteClick = false;
  sopaPrimerToque: SopaCelda | null = null;
  sopaRutaInvalida = signal<Array<{ f: number; c: number }>>([]);
  private sopaTimerRutaInvalida: number | null = null;

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
    if (typeof window !== 'undefined') {
      const juegoPresentado = sessionStorage.getItem('juegoPresentado');
      if (juegoPresentado) {
        this.mostrarInvitacionJuego.set(false);
      }
    }
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

  irABuscar(): void {
    this.router.navigateByUrl('/buscar');
  }

  verPalabra(p: Palabra): void {
    this.router.navigate(['/palabra', p._id], {
      state: { concepto: p.concepto, significado: p.significado }
    });
  }

  nuevaPalabra(): void {
    this.router.navigate(['/palabra/nueva']);
  }

  cerrarInvitacionJuego(): void {
    this.mostrarInvitacionJuego.set(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('juegoPresentado', 'true');
    }
  }

  async aceptarInvitacionJuego(): Promise<void> {
    if (this.cargandoAceptarInvitacion()) return;

    this.cargandoAceptarInvitacion.set(true);
    this.mostrarInvitacionJuego.set(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('juegoPresentado', 'true');
    }
    this.juegoActivo.set(true);

    try {
      await this.prepararJuego();
    } finally {
      this.cargandoAceptarInvitacion.set(false);
    }
  }

  async iniciarJuegoDirecto(): Promise<void> {
    if (this.cargandoInicioJuego()) return;

    this.cargandoInicioJuego.set(true);
    this.juegoActivo.set(true);

    try {
      await this.prepararJuego();
    } finally {
      this.cargandoInicioJuego.set(false);
    }
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
    try {
      await this.prepararJuego(this.tipoJuego());
    } finally {
      this.cargandoOtroJuego.set(false);
    }
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
}