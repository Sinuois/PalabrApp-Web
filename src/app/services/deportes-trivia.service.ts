import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface TriviaDeportes {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
}

export type CategoriaTriviaDeportes = 'aleatoria' | 'futbol' | 'basquetbol' | 'tenis' | 'formula1' | 'olimpicos';

const CATEGORIAS_DEPORTES: ReadonlySet<Exclude<CategoriaTriviaDeportes, 'aleatoria'>> = new Set([
  'futbol',
  'basquetbol',
  'tenis',
  'formula1',
  'olimpicos'
]);

type PreguntaDeportes = {
  pregunta: string;
  correcta: string;
  distractores: string[];
  datoExtra?: string;
  categoria: Exclude<CategoriaTriviaDeportes, 'aleatoria'>;
};

@Injectable({ providedIn: 'root' })
export class DeportesTriviaService {
  private http = inject(HttpClient);
  private banco: PreguntaDeportes[] | null = null;
  private cargaEnCurso: Promise<PreguntaDeportes[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;

  async generarPregunta(categoria: CategoriaTriviaDeportes = 'aleatoria'): Promise<TriviaDeportes | null> {
    const bancoCompleto = await this.cargarBanco();
    const banco = categoria === 'aleatoria'
      ? bancoCompleto
      : bancoCompleto.filter((item) => item.categoria === categoria);
    if (banco.length < 1) return null;

    let fallback: TriviaDeportes | null = null;
    const orden = this.barajar(banco);

    for (const base of orden) {
      if (base.distractores.length < 3) continue;

      const opciones = this.barajar([base.correcta, ...base.distractores.slice(0, 3)]);
      const reto: TriviaDeportes = {
        pregunta: base.pregunta,
        opciones,
        indiceCorrecto: opciones.findIndex((op) => op === base.correcta),
        datoExtra: base.datoExtra
      };

      if (!fallback) fallback = reto;
      if (this.esPreguntaReciente(reto)) continue;

      this.registrarPreguntaReciente(reto);
      return reto;
    }

    if (fallback) this.registrarPreguntaReciente(fallback);
    return fallback;
  }

  async obtenerTotalDisponible(categoria: CategoriaTriviaDeportes = 'aleatoria'): Promise<number> {
    const banco = await this.cargarBanco();
    if (categoria === 'aleatoria') return banco.length;
    return banco.filter((item) => item.categoria === categoria).length;
  }

  private async cargarBanco(): Promise<PreguntaDeportes[]> {
    if (this.banco) return this.banco;
    if (this.cargaEnCurso) return this.cargaEnCurso;

    this.cargaEnCurso = firstValueFrom(this.http.get('data/deportes-trivia.txt', { responseType: 'text' }))
      .then((contenido) => {
        const parseado = this.parsearFuente(contenido);
        this.banco = parseado;
        return parseado;
      })
      .finally(() => {
        this.cargaEnCurso = null;
      });

    return this.cargaEnCurso;
  }

  private parsearFuente(contenido: string): PreguntaDeportes[] {
    const banco: PreguntaDeportes[] = [];

    const lineas = contenido
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea && !linea.startsWith('#'));

    for (const linea of lineas) {
      const partes = linea.split('|').map((p) => p.trim());
      if (partes[0] !== 'Q' || partes.length < 7) continue;

      const categoria = this.parsearCategoria(partes[1]);
      if (!categoria) continue;

      const pregunta = partes[2];
      const correcta = partes[3];
      const distractores = [partes[4], partes[5], partes[6]].filter(Boolean);
      const datoExtra = partes[7] || undefined;

      if (!pregunta || !correcta || distractores.length < 3) continue;
      banco.push({ pregunta, correcta, distractores, datoExtra, categoria });
    }

    return banco;
  }

  private esPreguntaReciente(reto: TriviaDeportes): boolean {
    return this.preguntasRecientes.includes(reto.pregunta);
  }

  private registrarPreguntaReciente(reto: TriviaDeportes): void {
    this.preguntasRecientes.push(reto.pregunta);
    if (this.preguntasRecientes.length > this.maxPreguntasRecientes) {
      this.preguntasRecientes.shift();
    }
  }

  private barajar<T>(arr: T[]): T[] {
    const copia = [...arr];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  private parsearCategoria(valor: string): Exclude<CategoriaTriviaDeportes, 'aleatoria'> | null {
    if (CATEGORIAS_DEPORTES.has(valor as Exclude<CategoriaTriviaDeportes, 'aleatoria'>)) {
      return valor as Exclude<CategoriaTriviaDeportes, 'aleatoria'>;
    }
    return null;
  }
}
