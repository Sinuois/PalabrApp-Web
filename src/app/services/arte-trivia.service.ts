import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PINTURAS_ARTE } from './arte-pinturas.data';

export interface TriviaArte {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
  imagenUrl?: string;
}

type PreguntaArte = {
  pregunta: string;
  correcta: string;
  distractores: string[];
  datoExtra?: string;
};

@Injectable({ providedIn: 'root' })
export class ArteTriviaService {
  private http = inject(HttpClient);
  private banco: PreguntaArte[] | null = null;
  private cargaEnCurso: Promise<PreguntaArte[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;
  private readonly opcionesPinturaObjetivo = 6;
  private readonly pinturas = PINTURAS_ARTE;

  async generarPregunta(): Promise<TriviaArte | null> {
    const banco = await this.cargarBanco();
    const hayTriviaTexto = banco.length >= 3;
    const hayTriviaPintura = this.pinturas.length >= 4;
    if (!hayTriviaTexto && !hayTriviaPintura) return null;

    if (hayTriviaPintura && Math.random() < 0.45) {
      const retoPintura = this.generarAdivinaPintura();
      if (retoPintura) {
        if (!this.esPreguntaReciente(retoPintura)) {
          this.registrarPreguntaReciente(retoPintura);
        }
        return retoPintura;
      }
    }

    if (!hayTriviaTexto) {
      const retoPintura = this.generarAdivinaPintura();
      if (retoPintura) this.registrarPreguntaReciente(retoPintura);
      return retoPintura;
    }

    let fallback: TriviaArte | null = null;
    const orden = this.barajar(banco);

    for (const base of orden) {
      if (base.distractores.length < 3) continue;

      const opciones = this.barajar([base.correcta, ...base.distractores.slice(0, 3)]);
      const reto: TriviaArte = {
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

  private generarAdivinaPintura(): TriviaArte | null {
    const correcta = this.elegirUno(this.pinturas);
    if (!correcta) return null;

    const opcionCorrecta = this.formatearOpcionPintura(correcta.titulo, correcta.autor);
    const opciones = this.generarOpcionesPintura(correcta, opcionCorrecta);
    if (opciones.length < 4) return null;

    return {
      pregunta: '¿Qué título y artista corresponden a esta pintura?',
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === opcionCorrecta),
      imagenUrl: correcta.imagenUrl,
      datoExtra: correcta.datoExtra ? `${correcta.datoExtra} Autor: ${correcta.autor}.` : `Autor: ${correcta.autor}.`
    };
  }

  private formatearOpcionPintura(titulo: string, autor: string): string {
    return `${titulo} — ${autor}`;
  }

  private generarOpcionesPintura(
    correcta: (typeof PINTURAS_ARTE)[number],
    opcionCorrecta: string
  ): string[] {
    const opciones = new Set<string>([opcionCorrecta]);

    const autoresIncorrectos = this.pinturas.filter((p) => p.autor !== correcta.autor).map((p) => p.autor);
    const titulosIncorrectos = this.pinturas.filter((p) => p.titulo !== correcta.titulo).map((p) => p.titulo);

    const autorMismoTitulo = this.elegirUno(this.barajar([...new Set(autoresIncorrectos)]));
    if (autorMismoTitulo) {
      opciones.add(this.formatearOpcionPintura(correcta.titulo, autorMismoTitulo));
    }

    const tituloMismoAutor = this.elegirUno(this.barajar([...new Set(titulosIncorrectos)]));
    if (tituloMismoAutor) {
      opciones.add(this.formatearOpcionPintura(tituloMismoAutor, correcta.autor));
    }

    const titulosBarajados = this.barajar([...new Set(titulosIncorrectos)]);
    const autoresBarajados = this.barajar([...new Set(autoresIncorrectos)]);

    for (const titulo of titulosBarajados) {
      if (opciones.size >= this.opcionesPinturaObjetivo) break;
      for (const autor of autoresBarajados) {
        if (autor === correcta.autor) continue;
        opciones.add(this.formatearOpcionPintura(titulo, autor));
        if (opciones.size >= this.opcionesPinturaObjetivo) break;
      }
    }

    return this.barajar([...opciones]);
  }

  private async cargarBanco(): Promise<PreguntaArte[]> {
    if (this.banco) return this.banco;
    if (this.cargaEnCurso) return this.cargaEnCurso;

    this.cargaEnCurso = firstValueFrom(this.http.get('data/arte-trivia.txt', { responseType: 'text' }))
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

  private parsearFuente(contenido: string): PreguntaArte[] {
    const banco: PreguntaArte[] = [];

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

  private esPreguntaReciente(reto: TriviaArte): boolean {
    return this.preguntasRecientes.includes(this.claveReciente(reto));
  }

  private registrarPreguntaReciente(reto: TriviaArte): void {
    this.preguntasRecientes.push(this.claveReciente(reto));
    if (this.preguntasRecientes.length > this.maxPreguntasRecientes) {
      this.preguntasRecientes.shift();
    }
  }

  private claveReciente(reto: TriviaArte): string {
    return reto.imagenUrl ? `${reto.pregunta}|${reto.imagenUrl}` : reto.pregunta;
  }

  private elegirUno<T>(arr: T[]): T | null {
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)] ?? null;
  }

  private muestraDistinta<T>(arr: T[], cantidad: number): T[] {
    const unicos = [...new Set(arr)];
    return this.barajar(unicos).slice(0, cantidad);
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
