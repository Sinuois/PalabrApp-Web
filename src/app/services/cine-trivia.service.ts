import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface TriviaCine {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
}

type PreguntaCine = {
  pregunta: string;
  correcta: string;
  distractores: string[];
  datoExtra?: string;
};

@Injectable({ providedIn: 'root' })
export class CineTriviaService {
  private http = inject(HttpClient);
  private banco: PreguntaCine[] | null = null;
  private cargaEnCurso: Promise<PreguntaCine[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;

  async generarPregunta(): Promise<TriviaCine | null> {
    const banco = await this.cargarBanco();
    if (banco.length < 3) return null;

    let fallback: TriviaCine | null = null;
    const orden = this.barajar(banco);

    for (const base of orden) {
      if (base.distractores.length < 3) continue;

      const opciones = this.barajar([base.correcta, ...base.distractores.slice(0, 3)]);
      const reto: TriviaCine = {
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

  private async cargarBanco(): Promise<PreguntaCine[]> {
    if (this.banco) return this.banco;
    if (this.cargaEnCurso) return this.cargaEnCurso;

    this.cargaEnCurso = firstValueFrom(this.http.get('data/cine-trivia.txt', { responseType: 'text' }))
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

  private parsearFuente(contenido: string): PreguntaCine[] {
    const banco: PreguntaCine[] = [];

    const lineas = contenido
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea && !linea.startsWith('#'));

    for (const linea of lineas) {
      const partes = linea.split('|').map((p) => p.trim());
      if (partes[0] !== 'Q' || partes.length < 6) continue;

      const pregunta = partes[1];
      const correcta = partes[2];
      const distractores = [partes[3], partes[4], partes[5]].filter(Boolean);
      const datoExtra = partes[6] || undefined;

      if (!pregunta || !correcta || distractores.length < 3) continue;
      banco.push({ pregunta, correcta, distractores, datoExtra });
    }

    return banco;
  }

  private esPreguntaReciente(reto: TriviaCine): boolean {
    return this.preguntasRecientes.includes(reto.pregunta);
  }

  private registrarPreguntaReciente(reto: TriviaCine): void {
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
}
