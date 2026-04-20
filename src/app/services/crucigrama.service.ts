import { Injectable, signal } from '@angular/core';
import { Palabra } from '../interfaces/app.interfaces';
import { GameUtilsService } from './game-utils.service';

interface CrucigramaPalabra {
  id: string;
  concepto: string;
  significado: string;
  direccion: 'horizontal' | 'vertical';
  fila: number;
  columna: number;
}

export interface CrucigramaCelda {
  key: string;
  bloqueada: boolean;
  letra: string;
  numero?: number;
  fijaDesdeInicio?: boolean;
}

export interface CrucigramaPista {
  id: string;
  numero: number;
  pista: string;
}

@Injectable({ providedIn: 'root' })
export class CrucigramaService {
  crucigramaGrid = signal<CrucigramaCelda[][]>([]);
  crucigramaPistasHorizontales = signal<CrucigramaPista[]>([]);
  crucigramaPistasVerticales = signal<CrucigramaPista[]>([]);
  crucigramaRespuestas = signal<Map<string, string>>(new Map());
  ultimaCeldaCrucigrama = signal<string | null>(null);
  direccionCrucigrama = signal<{ dr: number; dc: number } | null>(null);
  crucigramaResuelto = signal<boolean | null>(null);

  constructor(private gameUtils: GameUtilsService) {}

  resetear(): void {
    this.crucigramaGrid.set([]);
    this.crucigramaPistasHorizontales.set([]);
    this.crucigramaPistasVerticales.set([]);
    this.crucigramaRespuestas.set(new Map());
    this.crucigramaResuelto.set(null);
    this.ultimaCeldaCrucigrama.set(null);
    this.direccionCrucigrama.set(null);
  }

  filtrarCandidatos(todas: Palabra[]): Palabra[] {
    return todas.filter(p => this.esConceptoValidoCrucigrama(p.concepto));
  }

  generar(candidatas: Palabra[]): boolean {
    const generado = this.generarCrucigrama(candidatas);
    if (!generado) return false;

    this.crucigramaGrid.set(generado.grid);
    this.crucigramaPistasHorizontales.set(generado.horizontales);
    this.crucigramaPistasVerticales.set(generado.verticales);
    this.crucigramaRespuestas.set(new Map());
    this.crucigramaResuelto.set(null);
    this.ultimaCeldaCrucigrama.set(null);
    this.direccionCrucigrama.set(null);

    return true;
  }

  actualizarCeldaCrucigrama(key: string, valor: string): void {
    if (this.crucigramaResuelto()) return;

    const celda = this.obtenerCeldaCrucigrama(key);
    if (celda?.fijaDesdeInicio) return;

    this.actualizarDireccionCrucigrama(key);

    const limpio = this.sanitizarEntradaCrucigrama(valor);
    this.crucigramaRespuestas.update(actual => {
      const siguiente = new Map(actual);
      if (!limpio) {
        siguiente.delete(key);
      } else {
        siguiente.set(key, limpio);
      }
      return siguiente;
    });

    this.ultimaCeldaCrucigrama.set(key);
  }

  obtenerDireccionInicialCrucigrama(key: string): 'h' | 'v' {
    const dirActual = this.direccionCrucigrama();
    if (dirActual) {
      if (dirActual.dr === 1 && dirActual.dc === 0) return 'v';
      if (dirActual.dr === 0 && dirActual.dc === 1) return 'h';
    }

    const pos = this.parsearKey(key);
    if (!pos) return 'h';

    const derecha = this.contarCeldasActivasEnDireccion(pos.fila, pos.columna, 0, 1);
    const abajo = this.contarCeldasActivasEnDireccion(pos.fila, pos.columna, 1, 0);

    if (abajo > derecha) return 'v';
    if (derecha > abajo) return 'h';
    return 'v';
  }

  obtenerDireccionAvanceCrucigrama(key: string): 'h' | 'v' {
    const dirActual = this.direccionCrucigrama();
    if (dirActual) {
      if (dirActual.dr === 1 && dirActual.dc === 0) return 'v';
      if (dirActual.dr === 0 && dirActual.dc === 1) return 'h';
    }

    const siguienteHorizontal = this.obtenerSiguienteEditableEnDireccionCrucigrama(key, 'h');
    const siguienteVertical = this.obtenerSiguienteEditableEnDireccionCrucigrama(key, 'v');

    if (siguienteHorizontal && !siguienteVertical) return 'h';
    if (siguienteVertical && !siguienteHorizontal) return 'v';

    if (siguienteHorizontal && siguienteVertical) {
      const pos = this.parsearKey(key);
      if (pos) {
        const ejeHorizontal =
          this.contarCeldasActivasEnDireccion(pos.fila, pos.columna, 0, 1) +
          this.contarCeldasActivasEnDireccion(pos.fila, pos.columna, 0, -1);
        const ejeVertical =
          this.contarCeldasActivasEnDireccion(pos.fila, pos.columna, 1, 0) +
          this.contarCeldasActivasEnDireccion(pos.fila, pos.columna, -1, 0);

        if (ejeHorizontal > ejeVertical) return 'h';
        if (ejeVertical > ejeHorizontal) return 'v';
      }
    }

    return this.obtenerDireccionInicialCrucigrama(key);
  }

  enfocarSiguienteCeldaCrucigrama(keyActual: string, direccion: 'h' | 'v'): string {
    return this.obtenerSiguienteEditableEnDireccionCrucigrama(keyActual, direccion) ?? keyActual;
  }

  revisarCrucigrama(): boolean {
    if (this.crucigramaGrid().length === 0) return false;

    const celdasEditables = this.crucigramaGrid().flat().filter(c => !c.bloqueada && !c.fijaDesdeInicio);
    const respuestas = this.crucigramaRespuestas();

    const completo = celdasEditables.every(c => !!respuestas.get(c.key));
    if (!completo) {
      this.crucigramaResuelto.set(false);
      return false;
    }

    const correcto = celdasEditables.every(c => {
      const user = respuestas.get(c.key) ?? '';
      return this.normalizarLetraCrucigrama(user) === this.normalizarLetraCrucigrama(c.letra);
    });

    this.crucigramaResuelto.set(correcto);
    return correcto;
  }

  private esConceptoValidoCrucigrama(concepto: string): boolean {
    const limpio = this.limpiarConceptoCrucigrama(concepto);
    if (limpio.length < 4 || limpio.length > 8) return false;
    return /^[A-ZÑ]+$/.test(limpio);
  }

  private generarCrucigrama(candidatas: Palabra[]): { grid: CrucigramaCelda[][]; horizontales: CrucigramaPista[]; verticales: CrucigramaPista[] } | null {
    const gridSize = 9;
    const baseRow = 4;

    for (let intento = 0; intento < 70; intento++) {
      const barajadas = [...candidatas].sort(() => Math.random() - 0.5);
      const base = barajadas[0];
      const palabraBase = this.limpiarConceptoCrucigrama(base.concepto);

      if (palabraBase.length > 8) continue;

      const baseStartCol = Math.floor((gridSize - palabraBase.length) / 2);
      const usadasCols = new Set<number>();
      const usadasRows = new Set<number>([baseRow]);
      const palabras: CrucigramaPalabra[] = [
        {
          id: 'H1',
          concepto: palabraBase,
          significado: base.significado,
          direccion: 'horizontal',
          fila: baseRow,
          columna: baseStartCol
        }
      ];

      const ocupadas = new Map<string, string>();
      for (let i = 0; i < palabraBase.length; i++) {
        ocupadas.set(`${baseRow}-${baseStartCol + i}`, palabraBase[i]);
      }

      for (const candidata of barajadas.slice(1)) {
        if (palabras.length >= 4) break;
        const concepto = this.limpiarConceptoCrucigrama(candidata.concepto);
        const ultimaDireccion = palabras[palabras.length - 1]?.direccion ?? 'horizontal';
        const direccionPreferida: 'horizontal' | 'vertical' = ultimaDireccion === 'horizontal' ? 'vertical' : 'horizontal';

        this.intentarAgregarPalabra(
          palabras,
          ocupadas,
          concepto,
          candidata.significado,
          direccionPreferida,
          gridSize,
          usadasCols,
          usadasRows
        );
      }

      const hayConsecutivasMismaDireccion = palabras.some((p, idx) => idx > 0 && palabras[idx - 1].direccion === p.direccion);
      if (hayConsecutivasMismaDireccion) continue;

      const verticales = palabras.filter(p => p.direccion === 'vertical');
      if (verticales.length < 2) continue;

      const startMap = new Map<string, number>();
      const starts = palabras
        .map(p => `${p.fila}-${p.columna}`)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .map(v => {
          const [fila, columna] = v.split('-').map(Number);
          return { key: v, fila, columna };
        })
        .sort((a, b) => (a.columna - b.columna) || (a.fila - b.fila));

      starts.forEach((s, idx) => startMap.set(s.key, idx + 1));

      const celdaAPorPalabra = new Map<string, { celdas: string[]; direccion: 'horizontal' | 'vertical' }>();
      for (const palabra of palabras) {
        const celdas: string[] = [];
        if (palabra.direccion === 'horizontal') {
          for (let i = 0; i < palabra.concepto.length; i++) {
            celdas.push(`${palabra.fila}-${palabra.columna + i}`);
          }
        } else {
          for (let i = 0; i < palabra.concepto.length; i++) {
            celdas.push(`${palabra.fila + i}-${palabra.columna}`);
          }
        }
        celdaAPorPalabra.set(palabra.id, { celdas, direccion: palabra.direccion });
      }

      const celdaTieneDosDir = new Set<string>();
      const entries = Array.from(celdaAPorPalabra.entries());
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [, dataA] = entries[i];
          const [, dataB] = entries[j];

          if (dataA.direccion === dataB.direccion) continue;

          const setA = new Set(dataA.celdas);
          for (const keyB of dataB.celdas) {
            if (setA.has(keyB)) {
              celdaTieneDosDir.add(keyB);
            }
          }
        }
      }

      const celdasPistasPredefinidas = new Set<string>();

      // Agregar pistas: inicio, final, y dos al azar en el medio de cada palabra
      for (const palabra of palabras) {
        const celdas = celdaAPorPalabra.get(palabra.id)?.celdas ?? [];

        if (celdas.length === 0) continue;

        // Inicio de la palabra
        celdasPistasPredefinidas.add(celdas[0]);

        // Final de la palabra
        if (celdas.length > 1) {
          celdasPistasPredefinidas.add(celdas[celdas.length - 1]);
        }

        // Dos letras al azar en el medio (si hay suficientes celdas)
        if (celdas.length > 2) {
          const medias = celdas.slice(1, celdas.length - 1);
          const barajadas = [...medias].sort(() => Math.random() - 0.5);
          const cantidad = Math.min(2, barajadas.length);
          for (let i = 0; i < cantidad; i++) {
            celdasPistasPredefinidas.add(barajadas[i]);
          }
        }
      }

      const grid: CrucigramaCelda[][] = Array.from({ length: gridSize }, (_, row) =>
        Array.from({ length: gridSize }, (_, col) => {
          const key = `${row}-${col}`;
          const letra = ocupadas.get(key) ?? '';
          return {
            key,
            bloqueada: !letra,
            letra,
            fijaDesdeInicio: celdasPistasPredefinidas.has(key) && !celdaTieneDosDir.has(key)
          };
        })
      );

      for (const palabra of palabras) {
        const num = startMap.get(`${palabra.fila}-${palabra.columna}`);
        if (!num) continue;
        grid[palabra.fila][palabra.columna].numero = num;
      }

      const horizontales: CrucigramaPista[] = palabras
        .filter(p => p.direccion === 'horizontal')
        .map(p => ({
          id: p.id,
          numero: startMap.get(`${p.fila}-${p.columna}`) ?? 0,
          pista: p.significado
        }))
        .sort((a, b) => a.numero - b.numero);

      const pistasVerticales: CrucigramaPista[] = palabras
        .filter(p => p.direccion === 'vertical')
        .map(p => ({
          id: p.id,
          numero: startMap.get(`${p.fila}-${p.columna}`) ?? 0,
          pista: p.significado
        }))
        .sort((a, b) => a.numero - b.numero);

      return {
        grid,
        horizontales,
        verticales: pistasVerticales
      };
    }

    return null;
  }

  private intentarAgregarPalabra(
    palabras: CrucigramaPalabra[],
    ocupadas: Map<string, string>,
    concepto: string,
    significado: string,
    direccion: 'horizontal' | 'vertical',
    gridSize: number,
    usadasCols: Set<number>,
    usadasRows: Set<number>
  ): boolean {
    const palabrasCruce = palabras.filter(p => p.direccion !== direccion);

    for (const palabraCruce of palabrasCruce) {
      for (let i = 0; i < palabraCruce.concepto.length; i++) {
        const filaCruce = palabraCruce.direccion === 'horizontal' ? palabraCruce.fila : palabraCruce.fila + i;
        const colCruce = palabraCruce.direccion === 'horizontal' ? palabraCruce.columna + i : palabraCruce.columna;
        const letraCruce = palabraCruce.concepto[i];

        if (direccion === 'vertical' && usadasCols.has(colCruce)) continue;
        if (direccion === 'horizontal' && this.filaHorizontalBloqueada(filaCruce, usadasRows)) continue;

        for (let j = 0; j < concepto.length; j++) {
          if (this.normalizarLetraCrucigrama(concepto[j]) !== this.normalizarLetraCrucigrama(letraCruce)) continue;

          const startRow = direccion === 'vertical' ? filaCruce - j : filaCruce;
          const startCol = direccion === 'horizontal' ? colCruce - j : colCruce;

          if (startRow < 0 || startCol < 0) continue;
          if (direccion === 'vertical' && startRow + concepto.length > gridSize) continue;
          if (direccion === 'horizontal' && startCol + concepto.length > gridSize) continue;
          if (direccion === 'horizontal' && this.filaHorizontalBloqueada(startRow, usadasRows)) continue;
          if (this.inicioPalabraAdyacente(startRow, startCol, palabras)) continue;
          if (!this.bordesPalabraLibres(startRow, startCol, concepto.length, direccion, ocupadas, gridSize)) continue;

          let conflicto = false;
          for (let k = 0; k < concepto.length; k++) {
            const row = direccion === 'vertical' ? startRow + k : startRow;
            const col = direccion === 'horizontal' ? startCol + k : startCol;
            const key = `${row}-${col}`;
            const existente = ocupadas.get(key);

            if (existente && this.normalizarLetraCrucigrama(existente) !== this.normalizarLetraCrucigrama(concepto[k])) {
              conflicto = true;
              break;
            }

            if (!existente && this.tieneAdyacenciaNoPermitida(row, col, direccion, ocupadas)) {
              conflicto = true;
              break;
            }
          }

          if (conflicto) continue;

          for (let k = 0; k < concepto.length; k++) {
            const row = direccion === 'vertical' ? startRow + k : startRow;
            const col = direccion === 'horizontal' ? startCol + k : startCol;
            ocupadas.set(`${row}-${col}`, concepto[k]);
          }

          if (direccion === 'vertical') usadasCols.add(startCol);
          if (direccion === 'horizontal') usadasRows.add(startRow);

          const idPrefix = direccion === 'horizontal' ? 'H' : 'V';
          palabras.push({
            id: `${idPrefix}${palabras.length + 1}`,
            concepto,
            significado,
            direccion,
            fila: startRow,
            columna: startCol
          });
          return true;
        }
      }
    }

    return false;
  }

  private sanitizarEntradaCrucigrama(valor: string): string {
    if (!valor) return '';
    const ultimo = valor.trim().toUpperCase().slice(-1);
    const limpio = this.limpiarConceptoCrucigrama(ultimo);
    return /^[A-ZÑ]$/.test(limpio) ? limpio : '';
  }

  private normalizarLetraCrucigrama(letra: string): string {
    return letra
      .toUpperCase()
      .replace(/[ÁÀÄÂ]/g, 'A')
      .replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[ÓÒÖÔ]/g, 'O')
      .replace(/[ÚÙÜÛ]/g, 'U');
  }

  private limpiarConceptoCrucigrama(valor: string): string {
    return valor
      .trim()
      .toUpperCase()
      .replace(/[ÁÀÄÂ]/g, 'A')
      .replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[ÓÒÖÔ]/g, 'O')
      .replace(/[ÚÙÜÛ]/g, 'U')
      .replace(/[^A-ZÑ]/g, '');
  }

  private filaHorizontalBloqueada(fila: number, usadasRows: Set<number>): boolean {
    return usadasRows.has(fila) || usadasRows.has(fila - 1) || usadasRows.has(fila + 1);
  }

  private inicioPalabraAdyacente(fila: number, columna: number, palabras: CrucigramaPalabra[]): boolean {
    return palabras.some((p) => {
      const distanciaFila = Math.abs(p.fila - fila);
      const distanciaColumna = Math.abs(p.columna - columna);
      return distanciaFila + distanciaColumna <= 1;
    });
  }

  private bordesPalabraLibres(
    fila: number,
    columna: number,
    largo: number,
    direccion: 'horizontal' | 'vertical',
    ocupadas: Map<string, string>,
    gridSize: number
  ): boolean {
    if (direccion === 'horizontal') {
      const antesCol = columna - 1;
      const despuesCol = columna + largo;

      if (antesCol >= 0 && ocupadas.has(`${fila}-${antesCol}`)) return false;
      if (despuesCol < gridSize && ocupadas.has(`${fila}-${despuesCol}`)) return false;
      return true;
    }

    const antesFila = fila - 1;
    const despuesFila = fila + largo;

    if (antesFila >= 0 && ocupadas.has(`${antesFila}-${columna}`)) return false;
    if (despuesFila < gridSize && ocupadas.has(`${despuesFila}-${columna}`)) return false;
    return true;
  }

  private tieneAdyacenciaNoPermitida(
    fila: number,
    columna: number,
    direccion: 'horizontal' | 'vertical',
    ocupadas: Map<string, string>
  ): boolean {
    if (direccion === 'horizontal') {
      return ocupadas.has(`${fila - 1}-${columna}`) || ocupadas.has(`${fila + 1}-${columna}`);
    }

    return ocupadas.has(`${fila}-${columna - 1}`) || ocupadas.has(`${fila}-${columna + 1}`);
  }

  private actualizarDireccionCrucigrama(actualKey: string): void {
    const anterior = this.ultimaCeldaCrucigrama();
    if (!anterior || anterior === actualKey) {
      this.direccionCrucigrama.set(null);
      return;
    }

    const a = this.parsearKey(anterior);
    const b = this.parsearKey(actualKey);
    if (!a || !b) {
      this.direccionCrucigrama.set(null);
      return;
    }

    const dr = b.fila - a.fila;
    const dc = b.columna - a.columna;
    const esAdyacente = Math.abs(dr) + Math.abs(dc) === 1;
    if (!esAdyacente) {
      this.direccionCrucigrama.set(null);
      return;
    }

    this.direccionCrucigrama.set({ dr, dc });
  }

  private parsearKey(key: string): { fila: number; columna: number } | null {
    const [filaRaw, columnaRaw] = key.split('-');
    const fila = Number(filaRaw);
    const columna = Number(columnaRaw);
    if (!Number.isInteger(fila) || !Number.isInteger(columna)) return null;
    return { fila, columna };
  }

  private contarCeldasActivasEnDireccion(fila: number, columna: number, dr: number, dc: number): number {
    if (dr === 0 && dc === 0) return 0;

    let total = 0;
    let r = fila + dr;
    let c = columna + dc;
    let pasos = 0;

    while (this.esCeldaActivaCrucigrama(`${r}-${c}`) && pasos < 20) {
      total++;
      r += dr;
      c += dc;
      pasos++;
    }

    return total;
  }

  private esCeldaActivaCrucigrama(key: string): boolean {
    const pos = this.parsearKey(key);
    if (!pos) return false;
    const grid = this.crucigramaGrid();
    if (pos.fila < 0 || pos.columna < 0 || pos.fila >= grid.length) return false;
    if (pos.columna >= (grid[pos.fila]?.length ?? 0)) return false;

    const celda = grid[pos.fila][pos.columna];
    return !!celda && !celda.bloqueada;
  }

  private esCeldaActivaYEditableCrucigrama(key: string): boolean {
    const pos = this.parsearKey(key);
    if (!pos) return false;
    const grid = this.crucigramaGrid();
    if (pos.fila < 0 || pos.columna < 0 || pos.fila >= grid.length) return false;
    if (pos.columna >= (grid[pos.fila]?.length ?? 0)) return false;

    const celda = grid[pos.fila][pos.columna];
    return !!celda && !celda.bloqueada && !celda.fijaDesdeInicio;
  }

  private obtenerCeldaCrucigrama(key: string): CrucigramaCelda | null {
    const pos = this.parsearKey(key);
    if (!pos) return null;
    const grid = this.crucigramaGrid();
    if (pos.fila < 0 || pos.columna < 0 || pos.fila >= grid.length) return null;
    if (pos.columna >= (grid[pos.fila]?.length ?? 0)) return null;
    return grid[pos.fila][pos.columna] ?? null;
  }

  private obtenerSiguienteEditableEnDireccionCrucigrama(keyActual: string, direccion: 'h' | 'v'): string | null {
    const actual = this.parsearKey(keyActual);
    if (!actual) return null;

    const dr = direccion === 'v' ? 1 : 0;
    const dc = direccion === 'h' ? 1 : 0;
    if (dr === 0 && dc === 0) return null;

    let fila = actual.fila + dr;
    let col = actual.columna + dc;
    let pasos = 0;

    while (this.esCeldaActivaCrucigrama(`${fila}-${col}`) && pasos < 20) {
      if (this.esCeldaActivaYEditableCrucigrama(`${fila}-${col}`)) {
        return `${fila}-${col}`;
      }
      fila += dr;
      col += dc;
      pasos++;
    }

    return null;
  }
}
