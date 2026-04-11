import { Injectable, signal } from '@angular/core';
import { Palabra } from '../interfaces/app.interfaces';
import { GameUtilsService } from './game-utils.service';

@Injectable({ providedIn: 'root' })
export class AhorcadoService {
  palabraAhorcado = signal('');
  significadoAhorcado = signal('');
  letrasAdivinadas = signal<string[]>([]);
  letrasIncorrectas = signal<string[]>([]);
  palabraMostrada = signal('');
  juegoAhorcadoGanado = signal<boolean | null>(null);
  intentosRestantes = signal(6);

  constructor(private gameUtils: GameUtilsService) {}

  resetear(): void {
    this.palabraAhorcado.set('');
    this.significadoAhorcado.set('');
    this.letrasAdivinadas.set([]);
    this.letrasIncorrectas.set([]);
    this.palabraMostrada.set('');
    this.juegoAhorcadoGanado.set(null);
    this.intentosRestantes.set(6);
  }

  generar(candidatas: Palabra[]): boolean {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();

    if (candidatas.length < 1) {
      return false;
    }

    const objetivo = candidatas[Math.floor(Math.random() * candidatas.length)];
    this.palabraAhorcado.set(objetivo.concepto.toUpperCase());
    this.significadoAhorcado.set(limpiar(objetivo.significado));
    this.actualizarPalabraMostrada();

    return true;
  }

  private actualizarPalabraMostrada(): void {
    const palabra = this.palabraAhorcado();
    const adivinadas = new Set(this.letrasAdivinadas());
    const mostrada = palabra
      .split('')
      .map(letra => {
        if (adivinadas.has(letra)) return letra;
        const letraNormalizada = this.gameUtils.normalizarLetra(letra);
        if (adivinadas.has(letraNormalizada)) return letra;
        return '_';
      })
      .join(' ');
    this.palabraMostrada.set(mostrada);
  }

  adivinarLetra(letra: string): { verificarEstado: boolean } {
    if (this.juegoAhorcadoGanado() !== null || this.intentosRestantes() <= 0) {
      return { verificarEstado: false };
    }

    const letraUpper = letra.toUpperCase();
    const letraNormalizada = this.gameUtils.normalizarLetra(letraUpper);
    const adivinadas = this.letrasAdivinadas();
    const incorrectas = this.letrasIncorrectas();

    if (adivinadas.includes(letraUpper) || incorrectas.includes(letraUpper)) {
      return { verificarEstado: false };
    }

    const palabra = this.palabraAhorcado();
    const tieneLetra = palabra
      .split('')
      .some(l => this.gameUtils.normalizarLetra(l) === letraNormalizada);

    if (tieneLetra) {
      this.letrasAdivinadas.set([...adivinadas, letraUpper]);
    } else {
      this.letrasIncorrectas.set([...incorrectas, letraUpper]);
      this.intentosRestantes.update(v => Math.max(0, v - 1));
    }

    this.actualizarPalabraMostrada();
    return { verificarEstado: true };
  }

  verificarEstado(): { gano: boolean; perdio: boolean } {
    const palabra = this.palabraAhorcado();
    const adivinadas = new Set(this.letrasAdivinadas());
    const intentos = this.intentosRestantes();

    const gano = palabra.split('').every(letra => {
      if (adivinadas.has(letra)) return true;
      const letraNormalizada = this.gameUtils.normalizarLetra(letra);
      return adivinadas.has(letraNormalizada);
    });
    const perdio = intentos <= 0;

    if (gano) {
      this.juegoAhorcadoGanado.set(true);
    } else if (perdio) {
      this.juegoAhorcadoGanado.set(false);
    }

    return { gano, perdio };
  }

  filtrarCandidatos(todas: Palabra[]): Palabra[] {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();
    return todas.filter(p => {
      const s = limpiar(p.significado);
      return p.concepto.length >= 4 && p.concepto.length <= 12 &&
             s.length >= 20 && s.length <= 170 &&
             !this.gameUtils.significadoIncluyeConcepto(p.concepto, s);
    });
  }
}
