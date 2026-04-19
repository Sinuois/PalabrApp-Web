import { AfterViewInit, ChangeDetectionStrategy, Component, HostListener, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PalabrasService, Orden } from '../../services/palabras.service';
import { GameUtilsService } from '../../services/game-utils.service';
import { AppActionsService } from '../../services/app-actions.service';
import { TriviaService } from '../../services/trivia.service';
import { AhorcadoService } from '../../services/ahorcado.service';
import { CrucigramaService, CrucigramaCelda } from '../../services/crucigrama.service';
import { SopaCelda, SopaService, SopaPalabra } from '../../services/sopa.service';
import { GeografiaChileTriviaService } from '../../services/geografia-chile-trivia.service';
import { CapitalesMundoTriviaService } from '../../services/capitales-mundo-trivia.service';
import { ArteTriviaService } from '../../services/arte-trivia.service';
import { CienciaTriviaService } from '../../services/ciencia-trivia.service';
import { MusicaTriviaService } from '../../services/musica-trivia.service';
import { MusicaPianoTriviaService } from '../../services/musica-piano-trivia.service';
import { CineTriviaService } from '../../services/cine-trivia.service';
import { DeportesTriviaService } from '../../services/deportes-trivia.service';
import { Palabra } from '../../interfaces/app.interfaces';
import { Subject } from 'rxjs';

type TipoJuego = 'trivia' | 'ahorcado' | 'crucigrama' | 'sopa';
type ModalidadJuego = 'aleatoria' | 'vocabulario' | 'geografia' | 'capitales' | 'arte' | 'ciencia' | 'musica' | 'cine' | 'deportes';
type ModalidadActiva = Exclude<ModalidadJuego, 'aleatoria'>;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {

  Math = Math;

  // UI Orchestration state (only what component manages)
  isRefreshing = signal(false);
  errorCarga = signal(false);
  mostrarInvitacionJuego = signal(true);
  pasoInvitacionJuego = signal<'actualizacion' | 'modalidad'>('actualizacion');
  juegoActivo = signal(false);
  juegoCargando = signal(false);
  tipoJuego = signal<TipoJuego>('trivia');
  modalidadJuego = signal<ModalidadJuego>('aleatoria');
  modalidadJuegoActiva = signal<ModalidadActiva>('vocabulario');
  mensajeJuego = signal('');
  mostrarCelebracion = signal(false);
  cargandoSeleccionModalidad = signal<ModalidadJuego | null>(null);
  cargandoInicioJuego = signal(false);
  cargandoOtroJuego = signal(false);
  navegandoBuscar = signal(false);
  navegandoNuevaPalabra = signal(false);
  cambiandoOrden = signal(false);
  sopaArrastrando = false;
  sopaUltimaCeldaArrastre: string | null = null;
  sopaArrastreTuvoMovimiento = false;
  sopaIgnorarSiguienteClick = false;
  sopaPrimerToque: SopaCelda | null = null;
  sopaRutaInvalida = signal<Array<{ f: number; c: number }>>([]);
  triviaDatoExtra = signal('');
  triviaImagenUrl = signal('');
  iconosModalidadesListos = signal(false);
  // Señal para controlar si estamos en modo piano
  modoPianoActivado = signal(false);
  private listaTouchInicioX = 0;
  private listaTouchInicioY = 0;
  private listaTouchSeMovio = false;
  private listaIgnorarClicksHasta = 0;
  private sopaTimerRutaInvalida: number | null = null;
  private ultimoTapTouchMs = 0;
  private ultimoTapTouchTarget: EventTarget | null = null;
  private readonly ventanaIgnorarClickMs = 700;
  private readonly ventanaIgnorarPrimarioDuplicadoMs = 120;
  private ultimoCambioOrdenMs = 0;
  private juegoAbriendoHasta = 0;
  private invitacionAbriendoHasta = 0;
  private crucigramaActualizandoTimer: any = null;
  private letraIndiceActivaTimer: number | null = null;
  private alfabetoIgnorarClickHasta = 0;
  private iconosModalidadPendientes = new Set<ModalidadJuego>();
  private destroy$ = new Subject<void>();
  private geografiaTriviaService = inject(GeografiaChileTriviaService);
  private capitalesTriviaService = inject(CapitalesMundoTriviaService);
  private arteTriviaService = inject(ArteTriviaService);
  private cienciaTriviaService = inject(CienciaTriviaService);
  private musicaTriviaService = inject(MusicaTriviaService);
  readonly musicaPianoTriviaService = inject(MusicaPianoTriviaService);
  private cineTriviaService = inject(CineTriviaService);
  private deportesTriviaService = inject(DeportesTriviaService);

  get orden()            { return this.palabrasService.orden; }
  get palabrasOrdenadas(){ return this.palabrasService.palabrasOrdenadas; }
  get cantPalabras()     { return this.palabrasService.cantPalabras(); }
  get cargado()          { return this.palabrasService.cargado(); }
  letraIndiceActiva = signal<string | null>(null);
  letraIndiceActivaTop = 0;

  alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  obtenerLetraInicial(concepto: string): string {
    if (!concepto) return '#';
    const normalizado = this.gameUtils.normalizarParaComparar(concepto.charAt(0));
    return normalizado.charAt(0).toUpperCase() || '#';
  }

  scrollALetra(event: Event, letra: string): void {
    event.stopPropagation();

    if (event instanceof MouseEvent && Date.now() < this.alfabetoIgnorarClickHasta) {
      event.preventDefault();
      return;
    }

    if (event instanceof PointerEvent || event instanceof TouchEvent || event instanceof MouseEvent) {
      event.preventDefault();
    }

    if ((event instanceof MouseEvent || event instanceof PointerEvent) && (event as MouseEvent).clientY) {
      this.letraIndiceActivaTop = (event as MouseEvent).clientY;
    }

    this.scrollALetraInterno(letra);
  }

  private scrollALetraInterno(letra: string): void {
    this.letraIndiceActiva.set(letra);
    if (this.letraIndiceActivaTimer !== null) {
      window.clearTimeout(this.letraIndiceActivaTimer);
    }
    this.letraIndiceActivaTimer = window.setTimeout(() => {
      this.letraIndiceActiva.set(null);
      this.letraIndiceActivaTimer = null;
    }, 700);
    const lista = document.querySelector<HTMLElement>('.lista-scroll');
    if (!lista) return;
    const item = lista.querySelector<HTMLElement>(`[data-letter="${letra}"]`);
    if (!item) return;
    item.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onAlphabetDragStart(event: TouchEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.alfabetoIgnorarClickHasta = Date.now() + 450;
    this.processAlphabetTouch(event);
  }

  onAlphabetDragMove(event: TouchEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.processAlphabetTouch(event);
  }

  onAlphabetDragEnd(): void {
    this.alfabetoIgnorarClickHasta = Date.now() + 450;
    // auto-clear timer in scrollALetraInterno handles hiding bubble
  }

  private processAlphabetTouch(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    this.letraIndiceActivaTop = touch.clientY;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const boton = el?.closest<HTMLElement>('[data-letra]');
    const letra = boton?.dataset['letra'];
    if (!letra) return;
    this.scrollALetraInterno(letra);
  }

  constructor(
    private palabrasService: PalabrasService,
    private router: Router,
    public triviaService: TriviaService,
    public ahorcadoService: AhorcadoService,
    public crucigramaService: CrucigramaService,
    public sopaService: SopaService,
    private gameUtils: GameUtilsService,
    private appActions: AppActionsService
  ) {}

  ngOnInit(): void {
    // Mostrar invitación solo una vez por sesión (solo en navegador)
    if (this.leerJuegoPresentadoEnSesion()) {
      this.mostrarInvitacionJuego.set(false);
    }
    this.precalentarRutasSecundarias();
    this.refrescar();

    // Suscribirse a eventos del servicio compartido
    this.appActions.iniciarJuego$.subscribe(() => {
      this.abrirSelectorModalidadJuego();
    });

    this.appActions.nuevoConcepto$.subscribe(() => {
      void this.nuevaPalabra();
    });

    this.appActions.volver$.subscribe(() => {
      void this.router.navigateByUrl('/');
    });

    if (typeof history !== 'undefined' && history.state?.abrirModalidadJuegoDesdeNav) {
      this.juegoAbriendoHasta = Date.now() + 350;
      setTimeout(() => {
        this.abrirSelectorModalidadJuego();
      }, 0);

      // Limpiar bandera para no reabrir selector en futuras entradas a Home.
      const stateActual = history.state ?? {};
      const { abrirModalidadJuegoDesdeNav: _omit, ...resto } = stateActual;
      history.replaceState(resto, '');
    }
  }

  ngOnDestroy(): void {
    if (this.letraIndiceActivaTimer !== null) {
      window.clearTimeout(this.letraIndiceActivaTimer);
      this.letraIndiceActivaTimer = null;
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    // Restaurar posición de scroll al volver desde una palabra
    if (typeof document === 'undefined') return;
    try {
      const scrollGuardado = sessionStorage.getItem('home_scroll');
      if (scrollGuardado) {
        const pos = parseInt(scrollGuardado, 10);
        sessionStorage.removeItem('home_scroll');
        const lista = document.querySelector<HTMLElement>('.lista-scroll');
        if (lista) lista.scrollTop = pos;
      }
    } catch { /* Safari privado */ }
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
    const ciclo: Orden[] = ['Abc', 'New'];
    const idx = ciclo.indexOf(this.palabrasService.orden());
    this.palabrasService.orden.set(ciclo[(idx + 1) % ciclo.length]);

    if (this.palabrasService.orden() === 'New') {
      this.scrollListaAlInicio();
    }
  }

  private scrollListaAlInicio(): void {
    if (typeof document === 'undefined') return;
    const lista = document.querySelector<HTMLElement>('.lista-scroll');
    lista?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onCiclarOrdenTap(event: Event): void {
    const ahora = Date.now();
    const esClick = event.type === 'click';

    if (esClick && ahora - this.ultimoCambioOrdenMs < 650) return;
    if (!esClick && ahora - this.ultimoCambioOrdenMs < 120) return;

    this.ultimoCambioOrdenMs = ahora;
    this.cambiandoOrden.set(true);
    this.ciclarOrden();
    
    // Mostrar el spinner por 300ms para feedback visual
    setTimeout(() => this.cambiandoOrden.set(false), 300);
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
    // Guardar posición de scroll antes de navegar
    try {
      const lista = document.querySelector<HTMLElement>('.lista-scroll');
      if (lista) sessionStorage.setItem('home_scroll', String(lista.scrollTop));
    } catch { /* Safari privado */ }

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
    this.pasoInvitacionJuego.set('actualizacion');
    this.mostrarInvitacionJuego.set(false);
    this.marcarJuegoPresentadoEnSesion();
  }

  onOverlayInvitacionTap(event: Event): void {
    if (Date.now() < this.invitacionAbriendoHasta) {
      event.stopPropagation();
      return;
    }

    this.ejecutarTapSeguro(event, () => this.cerrarInvitacionJuego());
  }

  onCerrarInvitacionTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.cerrarInvitacionJuego());
  }

  abrirSelectorModalidadJuego(): void {
    this.reiniciarCargaIconosModalidad();
    this.juegoActivo.set(false);
    this.juegoCargando.set(false);
    this.invitacionAbriendoHasta = Date.now() + 350;
    this.mostrarInvitacionJuego.set(true);
    this.pasoInvitacionJuego.set('modalidad');
  }

  aceptarInvitacionJuego(): void {
    this.reiniciarCargaIconosModalidad();
    this.invitacionAbriendoHasta = Date.now() + 300;
    this.pasoInvitacionJuego.set('modalidad');
  }

  onAceptarInvitacionTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => {
      this.aceptarInvitacionJuego();
    });
  }

  async seleccionarModalidadJuego(modalidad: ModalidadJuego): Promise<void> {
    if (this.cargandoSeleccionModalidad()) return;

    this.cargandoSeleccionModalidad.set(modalidad);
    this.modalidadJuego.set(modalidad);
    this.mostrarInvitacionJuego.set(false);
    this.pasoInvitacionJuego.set('actualizacion');
    this.juegoActivo.set(true);
    this.marcarJuegoPresentadoEnSesion();

    try {
      await this.prepararJuego();
    } finally {
      this.cargandoSeleccionModalidad.set(null);
    }
  }

  onSeleccionarModalidadTap(event: Event, modalidad: ModalidadJuego): void {
    this.ejecutarTapSeguro(event, () => {
      void this.seleccionarModalidadJuego(modalidad);
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
    this.modalidadJuegoActiva.set('vocabulario');
    this.mensajeJuego.set('');
    this.cargandoInicioJuego.set(false);
    this.cargandoSeleccionModalidad.set(null);
    this.cargandoOtroJuego.set(false);
    this.triviaService.resetear();
    this.ahorcadoService.resetear();
    this.crucigramaService.resetear();
    this.sopaService.resetear();
    this.musicaPianoTriviaService.limpiar();
    this.modoPianoActivado.set(false);
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

  onIconoModalidadLoad(event: Event): void {
    this.registrarIconoModalidad(event);
  }

  onIconoModalidadError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    img.style.display = 'none';
    const fallback = img.parentElement?.querySelector<HTMLElement>('.mode-icon-fallback');
    fallback?.classList.add('is-visible');

    this.registrarIconoModalidad(event);
  }

  onCerrarJuegoTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.cerrarJuego());
  }

  onOverlayJuegoTap(event: Event): void {
    if (Date.now() < this.juegoAbriendoHasta) {
      event.stopPropagation();
      return;
    }

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
      this.mensajeJuego.set('¡Felicitaciones, sigue así!');
      setTimeout(() => this.mostrarCelebracion.set(false), 3000);
      return;
    }

    this.mensajeJuego.set('No pasa nada, inténtalo de nuevo.');
  }

  onResolverOpcionTap(event: Event, indice: number): void {
    this.ejecutarTapSeguro(event, () => this.resolverOpcion(indice));
  }

  resolverOpcionPiano(indiceTecla: number): void {
    if (this.musicaPianoTriviaService.esCorrecta() !== null) return; // Ya respondió
    if (!this.modoPianoActivado()) return; // No estamos en modo piano

    this.musicaPianoTriviaService.reproducirTecla(indiceTecla);

    if (this.musicaPianoTriviaService.modoActual() === 'acorde') {
      this.musicaPianoTriviaService.alternarTeclaAcorde(indiceTecla);
      return;
    }

    const gano = this.musicaPianoTriviaService.verificarRespuestaNota(indiceTecla);
    if (gano) {
      this.mostrarCelebracion.set(true);
      this.mensajeJuego.set('¡Correcto! ¡Excelente!');
      setTimeout(() => this.mostrarCelebracion.set(false), 3000);
      return;
    }

    this.mensajeJuego.set('No es esa nota, inténtalo de nuevo.');
  }

  onResolverOpcionPianoTap(event: Event, indiceTecla: number): void {
    this.ejecutarTapSeguro(event, () => this.resolverOpcionPiano(indiceTecla));
  }

  confirmarAcordePiano(): void {
    if (this.musicaPianoTriviaService.modoActual() !== 'acorde') return;

    const resultado = this.musicaPianoTriviaService.confirmarAcorde();
    if (resultado === null) {
      this.mensajeJuego.set('Selecciona las notas del acorde antes de confirmar.');
      return;
    }

    if (resultado) {
      this.mostrarCelebracion.set(true);
      this.mensajeJuego.set('¡Acorde correcto!');
      setTimeout(() => this.mostrarCelebracion.set(false), 3000);
      return;
    }

    this.mensajeJuego.set('Ese no es el acorde correcto.');
  }

  onConfirmarAcordePianoTap(event: Event): void {
    this.ejecutarTapSeguro(event, () => this.confirmarAcordePiano());
  }

  claseOpcion(indice: number): string {
    return this.triviaService.claseOpcion(indice);
  }

  etiquetaPromptTrivia(): string {
    return this.modalidadJuegoActiva() === 'vocabulario' ? 'Concepto' : 'Pregunta';
  }

  tituloTrivia(): string {
    if (this.modalidadJuegoActiva() === 'geografia') {
      return '¡Trivia de geografía chilena!';
    }

    if (this.modalidadJuegoActiva() === 'capitales') {
      return '¡Trivia de países y capitales!';
    }

    if (this.modalidadJuegoActiva() === 'arte') {
      return '¡Trivia de arte!';
    }

    if (this.modalidadJuegoActiva() === 'ciencia') {
      return '¡Trivia de ciencia!';
    }

    if (this.modalidadJuegoActiva() === 'musica') {
      return '¡Trivia de música!';
    }

    if (this.modalidadJuegoActiva() === 'cine') {
      return '¡Trivia de cine!';
    }

    if (this.modalidadJuegoActiva() === 'deportes') {
      return '¡Trivia de deportes!';
    }

    return '¡Adivina el significado!';
  }

  etiquetaBotonSiguienteJuego(): string {
    if (this.modalidadJuego() === 'aleatoria') return 'Siguiente juego';
    return this.modalidadJuegoActiva() === 'vocabulario' ? 'Siguiente juego' : 'Siguiente pregunta';
  }

  private async prepararJuego(excluirTipo?: TipoJuego): Promise<void> {
    this.mensajeJuego.set('');
    this.mostrarCelebracion.set(false);
    this.triviaDatoExtra.set('');
    this.triviaImagenUrl.set('');

    const modalidadSeleccionada = this.modalidadJuego();
    let modalidadObjetivo: ModalidadActiva;
    if (modalidadSeleccionada === 'aleatoria') {
      modalidadObjetivo = this.elegirModalidadAleatoria();
    } else {
      modalidadObjetivo = modalidadSeleccionada;
    }
    this.modalidadJuegoActiva.set(modalidadObjetivo);

    if (modalidadObjetivo === 'geografia') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaGeografia();
      return;
    }

    if (modalidadObjetivo === 'capitales') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaCapitales();
      return;
    }

    if (modalidadObjetivo === 'arte') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaArte();
      return;
    }

    if (modalidadObjetivo === 'ciencia') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaCiencia();
      return;
    }

    if (modalidadObjetivo === 'musica') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaMusica();
      return;
    }

    if (modalidadObjetivo === 'cine') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaCine();
      return;
    }

    if (modalidadObjetivo === 'deportes') {
      this.tipoJuego.set('trivia');
      await this.prepararTriviaDeportes();
      return;
    }

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

  private async prepararTriviaGeografia(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');

    try {
      const reto = await this.geografiaTriviaService.generarPregunta();
      if (!reto) {
        this.mensajeJuego.set('No se pudo generar una pregunta de geografía chilena en este momento.');
        return;
      }

      this.triviaDatoExtra.set(reto.datoExtra ?? '');

      const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
      if (!exito) {
        this.mensajeJuego.set('No se pudo preparar la trivia de geografía chilena en este intento.');
      }
    } finally {
      this.juegoCargando.set(false);
    }
  }

  private async prepararTriviaCapitales(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');
    this.triviaImagenUrl.set('');

    try {
      const reto = await this.capitalesTriviaService.generarPregunta();
      if (!reto) {
        this.mensajeJuego.set('No se pudo generar una pregunta de países y capitales en este momento.');
        return;
      }

      this.triviaDatoExtra.set(reto.datoExtra ?? '');
      this.triviaImagenUrl.set(reto.imagenUrl ?? '');

      const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
      if (!exito) {
        this.mensajeJuego.set('No se pudo preparar la trivia de países y capitales en este intento.');
      }
    } finally {
      this.juegoCargando.set(false);
    }
  }

  private async prepararTriviaArte(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');

    try {
      const reto = await this.arteTriviaService.generarPregunta();
      if (!reto) {
        this.mensajeJuego.set('No se pudo generar una pregunta de arte en este momento.');
        return;
      }

      this.triviaDatoExtra.set(reto.datoExtra ?? '');

      const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
      if (!exito) {
        this.mensajeJuego.set('No se pudo preparar la trivia de arte en este intento.');
      }
    } finally {
      this.juegoCargando.set(false);
    }
  }

  private async prepararTriviaCiencia(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');

    try {
      const reto = await this.cienciaTriviaService.generarPregunta();
      if (!reto) {
        this.mensajeJuego.set('No se pudo generar una pregunta de ciencia en este momento.');
        return;
      }

      this.triviaDatoExtra.set(reto.datoExtra ?? '');

      const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
      if (!exito) {
        this.mensajeJuego.set('No se pudo preparar la trivia de ciencia en este intento.');
      }
    } finally {
      this.juegoCargando.set(false);
    }
  }

  private async prepararTriviaMusica(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');

    try {
      // 50% de probabilidad de trivia piano, 50% de trivia tradicional
      const usarPiano = Math.random() < 0.5;

      if (usarPiano) {
        // Modo piano trivia
        this.modoPianoActivado.set(true);
        this.musicaPianoTriviaService.limpiar();
        await this.musicaPianoTriviaService.generarPreguntaPiano();
      } else {
        // Trivia música tradicional
        this.modoPianoActivado.set(false);
        const reto = await this.musicaTriviaService.generarPregunta();
        if (!reto) {
          this.mensajeJuego.set('No se pudo generar una pregunta de música en este momento.');
          return;
        }

        this.triviaDatoExtra.set(reto.datoExtra ?? '');

        const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
        if (!exito) {
          this.mensajeJuego.set('No se pudo preparar la trivia de música en este intento.');
        }
      }
    } finally {
      this.juegoCargando.set(false);
    }
  }

  private async prepararTriviaCine(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');

    try {
      const reto = await this.cineTriviaService.generarPregunta();
      if (!reto) {
        this.mensajeJuego.set('No se pudo generar una pregunta de cine en este momento.');
        return;
      }

      this.triviaDatoExtra.set(reto.datoExtra ?? '');

      const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
      if (!exito) {
        this.mensajeJuego.set('No se pudo preparar la trivia de cine en este intento.');
      }
    } finally {
      this.juegoCargando.set(false);
    }
  }

  private async prepararTriviaDeportes(): Promise<void> {
    this.juegoCargando.set(true);
    this.triviaService.resetear();
    this.triviaDatoExtra.set('');

    try {
      const reto = await this.deportesTriviaService.generarPregunta();
      if (!reto) {
        this.mensajeJuego.set('No se pudo generar una pregunta de deportes en este momento.');
        return;
      }

      this.triviaDatoExtra.set(reto.datoExtra ?? '');

      const exito = this.triviaService.generarDesdeTrivia(reto.pregunta, reto.opciones, reto.indiceCorrecto);
      if (!exito) {
        this.mensajeJuego.set('No se pudo preparar la trivia de deportes en este intento.');
      }
    } finally {
      this.juegoCargando.set(false);
    }
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
    if (this.ahorcadoService.juegoAhorcadoGanado() !== null || this.ahorcadoService.intentosRestantes() <= 0) {
      return;
    }

    this.ahorcadoService.adivinarLetra(letra);
    const { gano, perdio } = this.ahorcadoService.verificarEstado();

    if (gano) {
      this.mostrarCelebracion.set(true);
      this.mensajeJuego.set('¡Lo adivinaste!');
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
    
    // Debounce el enfoque siguiente para evitar congelamiento en escritura rápida
    if (valor) {
      if (this.crucigramaActualizandoTimer !== null) {
        clearTimeout(this.crucigramaActualizandoTimer);
      }
      this.crucigramaActualizandoTimer = setTimeout(() => {
        this.enfocarSiguienteCeldaCrucigrama(key);
        this.crucigramaActualizandoTimer = null;
      }, 50);
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
    this.mensajeJuego.set('¡Crucigrama resuelto!');
    setTimeout(() => this.mostrarCelebracion.set(false), 3000);
  }

  private enfocarCeldaCrucigramaPorKey(key: string): void {
    if (typeof document === 'undefined') return;

    const selector = `input.crossword-input[data-cell-key="${key}"]`;
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input) return;

    // Enfocar directamente sin setTimeout adicional para evitar stack overflow
    input.focus();
    input.select();
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
      this.mensajeJuego.set('¡Sopa completada!');
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

    // Si el dedo/mouse se suelta fuera del elemento que recibió el handler,
    // cancelar la acción para evitar selecciones accidentales por arrastre.
    if ((event.type === 'touchend' || event.type === 'pointerup') && !this.esLiberacionDentroDelObjetivo(event)) {
      this.ultimoTapTouchMs = Date.now();
      this.ultimoTapTouchTarget = event.currentTarget;
      return;
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
      const ahora = Date.now();
      const primarioReciente = ahora - this.ultimoTapTouchMs < this.ventanaIgnorarPrimarioDuplicadoMs;
      const mismoObjetivoPrimario = this.esMismoObjetivoTap(event.target, this.ultimoTapTouchTarget);
      if (primarioReciente && mismoObjetivoPrimario) {
        return;
      }

      this.ultimoTapTouchMs = ahora;
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

  private esLiberacionDentroDelObjetivo(event: Event): boolean {
    const objetivo = event.currentTarget;
    if (!(objetivo instanceof Element)) {
      return true;
    }

    const punto = this.obtenerPuntoInteraccion(event);
    if (!punto) {
      return true;
    }

    const rect = objetivo.getBoundingClientRect();
    const tolerancia = 4;
    return (
      punto.x >= rect.left - tolerancia &&
      punto.x <= rect.right + tolerancia &&
      punto.y >= rect.top - tolerancia &&
      punto.y <= rect.bottom + tolerancia
    );
  }

  private obtenerPuntoInteraccion(event: Event): { x: number; y: number } | null {
    if (event instanceof TouchEvent) {
      const touch = event.changedTouches[0] ?? event.touches[0];
      if (!touch) return null;
      return { x: touch.clientX, y: touch.clientY };
    }

    if (event instanceof PointerEvent || event instanceof MouseEvent) {
      return { x: event.clientX, y: event.clientY };
    }

    return null;
  }

  private esMismoObjetivoTap(actual: EventTarget | null, previo: EventTarget | null): boolean {
    if (!(actual instanceof Element) || !(previo instanceof Element)) {
      return false;
    }

    return actual === previo || actual.contains(previo) || previo.contains(actual);
  }

  private mensajeDatoTrivia(): string {
    if (this.modalidadJuegoActiva() === 'vocabulario') return '';

    const dato = this.triviaDatoExtra().trim();
    if (!dato) return '';

    return `Dato extra: ${dato}`;
  }

  datoExtraTriviaVisible(): string {
    if (this.triviaService.indiceSeleccionado() === null) return '';
    return this.mensajeDatoTrivia();
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

  private reiniciarCargaIconosModalidad(): void {
    this.iconosModalidadPendientes = new Set<ModalidadJuego>(['aleatoria', 'vocabulario', 'geografia', 'capitales', 'arte', 'ciencia', 'musica', 'cine', 'deportes']);
    this.iconosModalidadesListos.set(false);
  }

  private elegirModalidadAleatoria(): ModalidadActiva {
    const modalidades: ModalidadActiva[] = ['vocabulario', 'geografia', 'capitales', 'arte', 'ciencia', 'musica', 'cine', 'deportes'];
    return modalidades[Math.floor(Math.random() * modalidades.length)] ?? 'vocabulario';
  }

  private registrarIconoModalidad(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    const modo = img.dataset['modo'] as ModalidadJuego | undefined;
    if (!modo || !this.iconosModalidadPendientes.has(modo)) return;

    this.iconosModalidadPendientes.delete(modo);
    if (this.iconosModalidadPendientes.size === 0) {
      this.iconosModalidadesListos.set(true);
    }
  }
}