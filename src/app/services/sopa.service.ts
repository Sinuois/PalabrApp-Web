import { Injectable, signal } from '@angular/core';
import { Palabra } from '../interfaces/app.interfaces';
import { GameUtilsService } from './game-utils.service';

export interface SopaPalabra {
  id: string;
  texto: string;
  textoComparacion: string;
  significado: string;
  path: Array<{ f: number; c: number }>;
}

export interface SopaCelda {
  f: number;
  c: number;
}

export interface SopaGridCelda {
  key: string;
  letra: string;
  fila: number;
  columna: number;
}

@Injectable({ providedIn: 'root' })
export class SopaService {
  sopaGrid = signal<SopaGridCelda[][]>([]);
  sopaPalabras = signal<SopaPalabra[]>([]);
  sopaEncontradas = signal<Set<string>>(new Set());
  sopaSeleccionInicio = signal<SopaCelda | null>(null);
  sopaSeleccionFin = signal<SopaCelda | null>(null);
  sopaPalabraSeleccionadaId = signal<string>('');
  sopaRutaSeleccion = signal<Array<{ f: number; c: number }>>([]);
  private readonly sopaDirecciones: Array<{ df: number; dc: number }> = [
    { df: 0, dc: 1 },
    { df: 0, dc: -1 },
    { df: 1, dc: 0 },
    { df: -1, dc: 0 },
    { df: 1, dc: 1 },
    { df: 1, dc: -1 },
    { df: -1, dc: 1 },
    { df: -1, dc: -1 }
  ];
  private readonly sopaDireccionesDiagonales: Array<{ df: number; dc: number }> = [
    { df: 1, dc: 1 },
    { df: 1, dc: -1 },
    { df: -1, dc: 1 },
    { df: -1, dc: -1 }
  ];

  constructor(private gameUtils: GameUtilsService) {}

  resetear(): void {
    this.sopaGrid.set([]);
    this.sopaPalabras.set([]);
    this.sopaEncontradas.set(new Set());
    this.sopaSeleccionInicio.set(null);
    this.sopaSeleccionFin.set(null);
    this.sopaPalabraSeleccionadaId.set('');
    this.sopaRutaSeleccion.set([]);
  }

  generar(candidatas: Palabra[]): boolean {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();

    const sinTildes = candidatas.filter(p => {
      const s = limpiar(p.significado);
      return p.concepto.length >= 4 && p.concepto.length <= 12 &&
             s.length >= 20 && s.length <= 170 &&
             !this.gameUtils.significadoIncluyeConcepto(p.concepto, s) &&
             !/[áéíóúüÁÉÍÓÚÜ]/.test(p.concepto);
    });

    if (sinTildes.length < 1) return false;

    const numPalabras = Math.min(sinTildes.length, Math.floor(Math.random() * 3) + 4);
    const palabrasElegidas: Palabra[] = [];
    const copia = [...sinTildes];
    for (let i = 0; i < numPalabras; i++) {
      const idx = Math.floor(Math.random() * copia.length);
      palabrasElegidas.push(copia[idx]);
      copia.splice(idx, 1);
    }

    const grid: string[][] = Array(10).fill(null).map(() => Array(10).fill(''));
    const palabrasObj: SopaPalabra[] = [];
    let diagonalColocada = false;

    for (const palabra of palabrasElegidas) {
      const texto = this.gameUtils.normalizarPalabraSopa(palabra.concepto);
      let colocado = false;
      let intentos = 500;

      while (!colocado && intentos > 0) {
        const fila = Math.floor(Math.random() * 10);
        const col = Math.floor(Math.random() * 10);
        const priorizarDiagonal = !diagonalColocada && intentos > 220;
        const direccionesDisponibles = priorizarDiagonal
          ? this.sopaDireccionesDiagonales
          : this.sopaDirecciones;
        const dir = direccionesDisponibles[Math.floor(Math.random() * direccionesDisponibles.length)];
        const path: Array<{ f: number; c: number }> = [];
        let puedeColocar = true;

        for (let i = 0; i < texto.length; i++) {
          const f = fila + dir.df * i;
          const c = col + dir.dc * i;

          if (f < 0 || f >= 10 || c < 0 || c >= 10) {
            puedeColocar = false;
            break;
          }

          if (grid[f][c] !== '' && grid[f][c] !== texto[i]) {
            puedeColocar = false;
            break;
          }

          path.push({ f, c });
        }

        if (puedeColocar) {
          for (let i = 0; i < texto.length; i++) {
            const p = path[i];
            grid[p.f][p.c] = texto[i];
          }

          palabrasObj.push({
            id: `sopa-${palabrasObj.length}`,
            texto: palabra.concepto,
            textoComparacion: texto,
            significado: limpiar(palabra.significado),
            path
          });
          if (dir.df !== 0 && dir.dc !== 0) {
            diagonalColocada = true;
          }
          colocado = true;
        }

        intentos--;
      }
    }

    const abecedario = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
    for (let f = 0; f < 10; f++) {
      for (let c = 0; c < 10; c++) {
        if (grid[f][c] === '') {
          grid[f][c] = abecedario[Math.floor(Math.random() * abecedario.length)];
        }
      }
    }

    const salida: SopaGridCelda[][] = grid.map((fila, r) =>
      fila.map((letra, c) => ({
        key: `${r}-${c}`,
        letra,
        fila: r,
        columna: c
      }))
    );

    this.sopaGrid.set(salida);
    this.sopaPalabras.set(palabrasObj);
    this.sopaEncontradas.set(new Set());
    this.sopaSeleccionInicio.set(null);
    this.sopaSeleccionFin.set(null);
    this.sopaPalabraSeleccionadaId.set('');
    this.sopaRutaSeleccion.set([]);

    return true;
  }

  seleccionarCeldaSopa(fila: number, col: number): void {
    const inicio = this.sopaSeleccionInicio();

    if (!inicio) {
      this.sopaSeleccionInicio.set({ f: fila, c: col });
      this.sopaSeleccionFin.set(null);
      this.sopaRutaSeleccion.set([{ f: fila, c: col }]);
    } else {
      this.sopaSeleccionFin.set({ f: fila, c: col });
      const ruta = this.calcularRuta(inicio.f, inicio.c, fila, col);
      this.sopaRutaSeleccion.set(ruta);
    }
  }

  private calcularRuta(f1: number, c1: number, f2: number, c2: number): Array<{ f: number; c: number }> {
    const ruta: Array<{ f: number; c: number }> = [];

    const dFila = f2 - f1;
    const dCol = c2 - c1;

    const pasoFila = Math.sign(dFila);
    const pasoCol = Math.sign(dCol);

    const esHorizontal = dFila === 0 && dCol !== 0;
    const esVertical = dCol === 0 && dFila !== 0;
    const esDiagonal = Math.abs(dFila) === Math.abs(dCol) && dFila !== 0;
    const esMismaCelda = dFila === 0 && dCol === 0;

    if (esMismaCelda) {
      ruta.push({ f: f1, c: c1 });
      return ruta;
    }

    if (!esHorizontal && !esVertical && !esDiagonal) {
      return ruta;
    }

    const pasos = Math.max(Math.abs(dFila), Math.abs(dCol));
    for (let i = 0; i <= pasos; i++) {
      ruta.push({
        f: f1 + pasoFila * i,
        c: c1 + pasoCol * i
      });
    }

    return ruta;
  }

  resolverSeleccionSopa(ruta: Array<{ f: number; c: number }>): boolean {
    if (ruta.length === 0) return false;

    const rutaTexto = ruta.map(p => this.sopaGrid()[p.f][p.c].letra).join('');
    const palabras = this.sopaPalabras();
    const encontradas = this.sopaEncontradas();

    for (const p of palabras) {
      if (encontradas.has(p.id)) continue;

      if (rutaTexto === p.textoComparacion || rutaTexto === p.textoComparacion.split('').reverse().join('')) {
        encontradas.add(p.id);
        this.sopaEncontradas.set(new Set(encontradas));
        this.sopaPalabraSeleccionadaId.set(p.id);
        return true;
      }
    }

    return false;
  }

  seleccionarPalabraSopa(id: string): void {
    const actual = this.sopaPalabraSeleccionadaId();
    if (actual === id) {
      this.sopaPalabraSeleccionadaId.set('');
      this.sopaRutaSeleccion.set([]);
      return;
    }

    this.sopaPalabraSeleccionadaId.set(id);

    const encontradas = this.sopaEncontradas();
    if (!encontradas.has(id)) {
      return;
    }

    const palabra = this.sopaPalabras().find(p => p.id === id);
    if (palabra) {
      this.sopaRutaSeleccion.set(palabra.path);
    }
  }

  filtrarCandidatos(todas: Palabra[]): Palabra[] {
    const limpiar = (txt: string): string => txt.replace(/\s+/g, ' ').trim();
    return todas.filter(p => {
      const s = limpiar(p.significado);
      return p.concepto.length >= 4 && p.concepto.length <= 12 &&
             s.length >= 20 && s.length <= 170 &&
             !this.gameUtils.significadoIncluyeConcepto(p.concepto, s) &&
             !/[áéíóúüÁÉÍÓÚÜ]/.test(p.concepto);
    });
  }
}
