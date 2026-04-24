import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CINE_PELICULAS } from './cine-peliculas.data';

export interface TriviaCine {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
  imagenUrl?: string;
}

type PreguntaCine = {
  pregunta: string;
  correcta: string;
  distractores: string[];
  datoExtra?: string;
};

type PeliculaCine = {
  titulo: string;
  director: string;
  imagenUrl: string;
  datoExtra?: string;
};

@Injectable({ providedIn: 'root' })
export class CineTriviaService {
  private http = inject(HttpClient);
  private banco: PreguntaCine[] | null = null;
  private cargaEnCurso: Promise<PreguntaCine[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;
  private readonly opcionesPeliculaObjetivo = 6;
  private readonly peliculas: readonly PeliculaCine[] = CINE_PELICULAS as readonly PeliculaCine[];

  async generarPregunta(): Promise<TriviaCine | null> {
    const banco = await this.cargarBanco();
    const hayTriviaTexto = banco.length >= 3;
    const hayTriviaPelicula = this.peliculas.length >= 4;
    if (!hayTriviaTexto && !hayTriviaPelicula) return null;

    if (hayTriviaPelicula && Math.random() < 0.45) {
      const retoPelicula = this.generarAdivinaPelicula();
      if (retoPelicula) {
        if (!this.esPreguntaReciente(retoPelicula)) {
          this.registrarPreguntaReciente(retoPelicula);
        }
        return retoPelicula;
      }
    }

    if (!hayTriviaTexto) {
      const retoPelicula = this.generarAdivinaPelicula();
      if (retoPelicula) this.registrarPreguntaReciente(retoPelicula);
      return retoPelicula;
    }

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

  private generarAdivinaPelicula(): TriviaCine | null {
    const correcta = this.elegirUno(this.peliculas);
    if (!correcta) return null;

    const opcionCorrecta = this.formatearOpcionPelicula(correcta.titulo, correcta.director);
    const opciones = this.generarOpcionesPelicula(correcta, opcionCorrecta);
    if (opciones.length < 4) return null;

    return {
      pregunta: '¿Qué película y director corresponden a esta imagen?',
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === opcionCorrecta),
      imagenUrl: correcta.imagenUrl,
      datoExtra: `${correcta.datoExtra ? `${correcta.datoExtra} ` : ''}Director: ${correcta.director}.`
    };
  }

  private formatearOpcionPelicula(titulo: string, director: string): string {
    return `${titulo} — ${director}`;
  }

  private generarOpcionesPelicula(
    correcta: PeliculaCine,
    opcionCorrecta: string
  ): string[] {
    const opciones = new Set<string>([opcionCorrecta]);

    const directoresIncorrectos = this.peliculas.filter((p) => p.director !== correcta.director).map((p) => p.director);
    const titulosIncorrectos = this.peliculas.filter((p) => p.titulo !== correcta.titulo).map((p) => p.titulo);

    const directorMismoTitulo = this.elegirUno(this.barajar([...new Set(directoresIncorrectos)]));
    if (directorMismoTitulo) {
      opciones.add(this.formatearOpcionPelicula(correcta.titulo, directorMismoTitulo));
    }

    const tituloMismoDirector = this.elegirUno(this.barajar([...new Set(titulosIncorrectos)]));
    if (tituloMismoDirector) {
      opciones.add(this.formatearOpcionPelicula(tituloMismoDirector, correcta.director));
    }

    const titulosBarajados = this.barajar([...new Set(titulosIncorrectos)]);
    const directoresBarajados = this.barajar([...new Set(directoresIncorrectos)]);

    for (const titulo of titulosBarajados) {
      if (opciones.size >= this.opcionesPeliculaObjetivo) break;
      for (const director of directoresBarajados) {
        if (director === correcta.director) continue;
        opciones.add(this.formatearOpcionPelicula(titulo, director));
        if (opciones.size >= this.opcionesPeliculaObjetivo) break;
      }
    }

    return this.barajar([...opciones]);
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
    return this.preguntasRecientes.includes(this.claveReciente(reto));
  }

  private registrarPreguntaReciente(reto: TriviaCine): void {
    this.preguntasRecientes.push(this.claveReciente(reto));
    if (this.preguntasRecientes.length > this.maxPreguntasRecientes) {
      this.preguntasRecientes.shift();
    }
  }

  private claveReciente(reto: TriviaCine): string {
    return reto.imagenUrl ? `${reto.pregunta}|${reto.imagenUrl}` : reto.pregunta;
  }

  private elegirUno<T>(arr: readonly T[]): T | null {
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)] ?? null;
  }

  private barajar<T>(arr: readonly T[]): T[] {
    const copia = [...arr];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }
}
