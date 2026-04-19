import { Injectable, signal } from '@angular/core';

export interface NotaMusical {
  nombre: string; // Do, Re, Mi, Fa, Sol, La, Si
  notacion: string; // C, D, E, F, G, A, B
  frecuencia: number; // Hz
  teclaIdx: number; // Índice en el teclado (0-11)
}

interface AcordeMusical {
  nombre: string;
  teclas: number[];
}

@Injectable({
  providedIn: 'root'
})
export class MusicaPianoTriviaService {
  // Notas cromáticas: Do, Do#, Re, Re#, Mi, Fa, Fa#, Sol, Sol#, La, La#, Si
  private notas: NotaMusical[] = [
    { nombre: 'Do', notacion: 'C', frecuencia: 261.63, teclaIdx: 0 },      // C4
    { nombre: 'Do#', notacion: 'C#', frecuencia: 277.18, teclaIdx: 1 },    // C#4
    { nombre: 'Re', notacion: 'D', frecuencia: 293.66, teclaIdx: 2 },      // D4
    { nombre: 'Re#', notacion: 'D#', frecuencia: 311.13, teclaIdx: 3 },    // D#4
    { nombre: 'Mi', notacion: 'E', frecuencia: 329.63, teclaIdx: 4 },      // E4
    { nombre: 'Fa', notacion: 'F', frecuencia: 349.23, teclaIdx: 5 },      // F4
    { nombre: 'Fa#', notacion: 'F#', frecuencia: 369.99, teclaIdx: 6 },    // F#4
    { nombre: 'Sol', notacion: 'G', frecuencia: 392.00, teclaIdx: 7 },     // G4
    { nombre: 'Sol#', notacion: 'G#', frecuencia: 415.30, teclaIdx: 8 },   // G#4
    { nombre: 'La', notacion: 'A', frecuencia: 440.00, teclaIdx: 9 },      // A4
    { nombre: 'La#', notacion: 'A#', frecuencia: 466.16, teclaIdx: 10 },   // A#4
    { nombre: 'Si', notacion: 'B', frecuencia: 493.88, teclaIdx: 11 }      // B4
  ];

  // Signals para el estado del juego
  modoActual = signal<'nota' | 'acorde'>('nota');
  notaActual = signal<NotaMusical | null>(null);
  notaEtiquetaPregunta = signal<string | null>(null);
  acordeActual = signal<AcordeMusical | null>(null);
  indiceSeleccionado = signal<number | null>(null); // para modo nota
  teclasSeleccionadasAcorde = signal<number[]>([]); // para modo acorde
  esCorrecta = signal<boolean | null>(null);

  // Para rastrear notas recientes
  private notasRecientes = new Set<number>();

  private acordes: AcordeMusical[] = [
    { nombre: 'Do mayor', teclas: [0, 4, 7] },
    { nombre: 'Re menor', teclas: [2, 5, 9] },
    { nombre: 'Mi menor', teclas: [4, 7, 11] },
    { nombre: 'Fa mayor', teclas: [5, 9, 0] },
    { nombre: 'Sol mayor', teclas: [7, 11, 2] },
    { nombre: 'La menor', teclas: [9, 0, 4] },
    { nombre: 'Si disminuido', teclas: [11, 2, 5] }
  ];

  private audioContext: AudioContext | null = null;

  constructor() {}

  private obtenerAudioContext(): AudioContext | null {
    try {
      if (typeof window === 'undefined') return null;
      if (!this.audioContext) {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return null;
        this.audioContext = new Ctx();
      }

      if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume();
      }

      return this.audioContext;
    } catch {
      return null;
    }
  }

  reproducirTecla(teclaIdx: number, duracion = 0.38): void {
    const nota = this.notas.find(n => n.teclaIdx === teclaIdx);
    if (!nota) return;

    const ctx = this.obtenerAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(nota.frecuencia, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duracion);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duracion + 0.01);
  }

  /**
   * Genera una nueva pregunta de trivia musical con piano
   */
  async generarPreguntaPiano(): Promise<void> {
    try {
      const modo = Math.random() < 0.6 ? 'nota' : 'acorde';
      this.modoActual.set(modo);
      this.indiceSeleccionado.set(null);
      this.teclasSeleccionadasAcorde.set([]);
      this.esCorrecta.set(null);

      if (modo === 'nota') {
        const notaCorrecta = this.seleccionarNotaEvitandoRecientes();
        this.notaActual.set(notaCorrecta);
        this.notaEtiquetaPregunta.set(this.obtenerNombrePreguntaNota(notaCorrecta));
        this.acordeActual.set(null);

        this.notasRecientes.add(notaCorrecta.teclaIdx);
        if (this.notasRecientes.size > 6) {
          const arr = Array.from(this.notasRecientes);
          this.notasRecientes.clear();
          arr.slice(-6).forEach(idx => this.notasRecientes.add(idx));
        }
      } else {
        const acorde = this.acordes[Math.floor(Math.random() * this.acordes.length)];
        this.acordeActual.set(acorde);
        this.notaActual.set(null);
        this.notaEtiquetaPregunta.set(null);
      }
    } catch (error) {
      console.error('Error generando pregunta piano:', error);
      throw error;
    }
  }

  /**
   * Verifica pregunta de nota simple
   */
  verificarRespuestaNota(teclaIdx: number): boolean {
    if (this.modoActual() !== 'nota' || !this.notaActual()) {
      return false;
    }

    const esCorrecta = teclaIdx === this.notaActual()!.teclaIdx;
    this.indiceSeleccionado.set(teclaIdx);
    this.esCorrecta.set(esCorrecta);
    return esCorrecta;
  }

  alternarTeclaAcorde(teclaIdx: number): void {
    if (this.modoActual() !== 'acorde' || this.esCorrecta() !== null) return;

    const actuales = this.teclasSeleccionadasAcorde();
    if (actuales.includes(teclaIdx)) {
      this.teclasSeleccionadasAcorde.set(actuales.filter(t => t !== teclaIdx));
      return;
    }

    this.teclasSeleccionadasAcorde.set([...actuales, teclaIdx]);
  }

  confirmarAcorde(): boolean | null {
    if (this.modoActual() !== 'acorde' || !this.acordeActual()) return null;

    const seleccionadas = [...this.teclasSeleccionadasAcorde()].sort((a, b) => a - b);
    const objetivo = [...this.acordeActual()!.teclas].sort((a, b) => a - b);
    if (seleccionadas.length === 0) return null;

    const esCorrecta =
      seleccionadas.length === objetivo.length &&
      seleccionadas.every((tecla, idx) => tecla === objetivo[idx]);

    this.esCorrecta.set(esCorrecta);
    return esCorrecta;
  }

  limpiarSeleccionAcorde(): void {
    if (this.modoActual() !== 'acorde' || this.esCorrecta() !== null) return;
    this.teclasSeleccionadasAcorde.set([]);
  }

  /**
   * Selecciona una nota evitando las recientes
   */
  private seleccionarNotaEvitandoRecientes(): NotaMusical {
    const notasDisponibles = this.notas.filter(n => !this.notasRecientes.has(n.teclaIdx));
    
    if (notasDisponibles.length === 0) {
      this.notasRecientes.clear();
      return this.notas[Math.floor(Math.random() * this.notas.length)];
    }

    return notasDisponibles[Math.floor(Math.random() * notasDisponibles.length)];
  }

  private obtenerNombrePreguntaNota(nota: NotaMusical): string {
    // En negras, alternar entre sostenido y bemol para incluir ambas nomenclaturas.
    const equivalenciasBemol: Record<number, string> = {
      1: 'Reb',
      3: 'Mib',
      6: 'Solb',
      8: 'Lab',
      10: 'Sib'
    };

    const bemol = equivalenciasBemol[nota.teclaIdx];
    if (!bemol) {
      return nota.nombre;
    }

    return Math.random() < 0.5 ? nota.nombre : bemol;
  }

  /**
   * Obtiene lista de todas las notas disponibles
   */
  obtenerNotasDisponibles(): NotaMusical[] {
    return [...this.notas];
  }

  /**
   * Obtiene el teclaIdx seleccionado (null si no hay selección)
   */
  obtenerTeclaIdxSeleccionada(): number | null {
    return this.indiceSeleccionado();
  }

  /**
   * Devuelve true cuando la tecla está seleccionada por el usuario
   */
  teclaEstaSeleccionada(teclaIdx: number): boolean {
    if (this.modoActual() === 'nota') {
      return this.indiceSeleccionado() === teclaIdx;
    }
    return this.teclasSeleccionadasAcorde().includes(teclaIdx);
  }

  /**
   * Devuelve true cuando la tecla forma parte de la respuesta correcta
   */
  teclaEsParteObjetivo(teclaIdx: number): boolean {
    if (this.modoActual() === 'nota') {
      return this.notaActual()?.teclaIdx === teclaIdx;
    }
    return this.acordeActual()?.teclas.includes(teclaIdx) ?? false;
  }

  /**
   * Retorna la etiqueta de lo que se debe mostrar
   */
  obtenerEtiquetaPregunta(): string {
    if (this.modoActual() === 'acorde') {
      return `Forma el acorde "${this.acordeActual()?.nombre}" seleccionando sus notas.`;
    }

    return `Selecciona la nota "${this.notaEtiquetaPregunta() ?? this.notaActual()?.nombre}".`;
  }

  obtenerNotasBlancas(): NotaMusical[] {
    return this.notas.filter(n => !n.notacion.includes('#'));
  }

  obtenerNotasNegras(): NotaMusical[] {
    return this.notas.filter(n => n.notacion.includes('#'));
  }

  obtenerPosicionNegra(teclaIdx: number): number {
    const posicionPorTecla: Record<number, number> = {
      1: 14.285,
      3: 28.57,
      6: 57.14,
      8: 71.42,
      10: 85.71
    };
    return posicionPorTecla[teclaIdx] ?? 0;
  }

  /**
   * Limpia el estado
   */
  limpiar(): void {
    this.notaActual.set(null);
    this.notaEtiquetaPregunta.set(null);
    this.acordeActual.set(null);
    this.modoActual.set('nota');
    this.indiceSeleccionado.set(null);
    this.teclasSeleccionadasAcorde.set([]);
    this.esCorrecta.set(null);
  }
}
