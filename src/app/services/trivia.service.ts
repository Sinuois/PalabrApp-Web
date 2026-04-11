import { Injectable, signal } from '@angular/core';
import { Palabra } from '../interfaces/app.interfaces';
import { GameUtilsService } from './game-utils.service';

@Injectable({ providedIn: 'root' })
export class TriviaService {
  conceptoJuego = signal('');
  opcionesJuego = signal<string[]>([]);
  indiceCorrecto = signal<number | null>(null);
  indiceSeleccionado = signal<number | null>(null);
  juegoGanado = signal<boolean | null>(null);

  constructor(private gameUtils: GameUtilsService) {}

  resetear(): void {
    this.conceptoJuego.set('');
    this.opcionesJuego.set([]);
    this.indiceCorrecto.set(null);
    this.indiceSeleccionado.set(null);
    this.juegoGanado.set(null);
  }

  generar(candidatas: Palabra[]): boolean {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();

    if (candidatas.length < 3) {
      return false;
    }

    const barajar = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
    const objetivo = candidatas[Math.floor(Math.random() * candidatas.length)];
    const distractoresPool = candidatas.filter(p => p._id !== objetivo._id);
    const distractores = barajar(distractoresPool).slice(0, 2);

    if (distractores.length < 2) {
      return false;
    }

    const opcionesCrudas = [objetivo.significado, distractores[0].significado, distractores[1].significado]
      .map(limpiar);
    const opcionesBarajadas = barajar(opcionesCrudas);
    const idxCorrecto = opcionesBarajadas.findIndex(o => o === limpiar(objetivo.significado));

    this.conceptoJuego.set(objetivo.concepto);
    this.opcionesJuego.set(opcionesBarajadas);
    this.indiceCorrecto.set(idxCorrecto);

    return true;
  }

  generarDesdeTrivia(pregunta: string, opciones: string[], indiceCorrecto: number): boolean {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();
    const preguntaLimpia = limpiar(pregunta);
    const opcionesLimpias = opciones.map(limpiar).filter(Boolean);

    if (!preguntaLimpia || opcionesLimpias.length < 3) {
      return false;
    }

    if (indiceCorrecto < 0 || indiceCorrecto >= opcionesLimpias.length) {
      return false;
    }

    this.conceptoJuego.set(preguntaLimpia);
    this.opcionesJuego.set(opcionesLimpias);
    this.indiceCorrecto.set(indiceCorrecto);

    return true;
  }

  resolverOpcion(indice: number): boolean {
    if (this.indiceSeleccionado() !== null) return false;

    this.indiceSeleccionado.set(indice);
    const acerto = indice === this.indiceCorrecto();
    this.juegoGanado.set(acerto);

    return acerto;
  }

  claseOpcion(indice: number): string {
    const seleccion = this.indiceSeleccionado();
    if (seleccion === null) return '';

    const correcto = this.indiceCorrecto();
    const ganado = this.juegoGanado();

    if (ganado) {
      if (indice === correcto) return 'correcta';
      return '';
    }

    if (indice === correcto) return 'correcta';
    if (indice === seleccion) return 'incorrecta';
    return '';
  }

  filtrarCandidatos(todas: Palabra[]): Palabra[] {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();
    return todas.filter(p => {
      const s = limpiar(p.significado);
      return s.length >= 20 && s.length <= 170 && !this.gameUtils.significadoIncluyeConcepto(p.concepto, s);
    });
  }
}
