import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface TriviaCapitalesMundo {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
}

type CapitalMundo = {
  pais: string;
  capital: string;
  continente: string;
  datoExtra?: string;
};

@Injectable({ providedIn: 'root' })
export class CapitalesMundoTriviaService {
  private http = inject(HttpClient);
  private banco: CapitalMundo[] | null = null;
  private cargaEnCurso: Promise<CapitalMundo[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;

  async generarPregunta(): Promise<TriviaCapitalesMundo | null> {
    const banco = await this.cargarBanco();
    if (banco.length < 6) return null;

    const plantillas: Array<() => TriviaCapitalesMundo | null> = [
      () => this.generarCapitalDePais(banco),
      () => this.generarPaisDeCapital(banco),
      () => this.generarContinenteDePais(banco)
    ];

    let fallback: TriviaCapitalesMundo | null = null;

    for (let intento = 0; intento < 24; intento++) {
      const orden = this.barajar(plantillas);
      for (const plantilla of orden) {
        const reto = plantilla();
        if (!reto) continue;

        if (!fallback) {
          fallback = reto;
        }

        if (this.esPreguntaReciente(reto)) {
          continue;
        }

        this.registrarPreguntaReciente(reto);
        return reto;
      }
    }

    if (fallback) {
      this.registrarPreguntaReciente(fallback);
    }
    return fallback;
  }

  private async cargarBanco(): Promise<CapitalMundo[]> {
    if (this.banco) return this.banco;
    if (this.cargaEnCurso) return this.cargaEnCurso;

    this.cargaEnCurso = firstValueFrom(this.http.get('data/capitales-mundo.txt', { responseType: 'text' }))
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

  private parsearFuente(contenido: string): CapitalMundo[] {
    const banco: CapitalMundo[] = [];

    const lineas = contenido
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea && !linea.startsWith('#'));

    for (const linea of lineas) {
      const partes = linea.split('|').map((p) => p.trim());
      if (partes[0] !== 'P' || partes.length < 4) continue;

      const pais = partes[1];
      const capital = partes[2];
      const continente = this.normalizarContinente(partes[3]);
      const datoExtra = partes[4] || undefined;

      if (!pais || !capital || !continente) continue;
      if (banco.some((it) => it.pais === pais || it.capital === capital)) continue;

      banco.push({ pais, capital, continente, datoExtra });
    }

    return banco;
  }

  private normalizarContinente(valor: string): string {
    const continente = valor.trim();
    if (!continente) return continente;

    if (/^america\b/i.test(continente) || /^caribe$/i.test(continente)) {
      return 'América';
    }

    return continente;
  }

  private generarCapitalDePais(banco: CapitalMundo[]): TriviaCapitalesMundo | null {
    const correcta = this.elegirUno(banco);
    if (!correcta) return null;

    const distractores = this.muestraDistinta(
      banco.filter((it) => it.pais !== correcta.pais).map((it) => it.capital),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta.capital, ...distractores]);
    return {
      pregunta: `¿Cuál es la capital de ${correcta.pais}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta.capital),
      datoExtra: correcta.datoExtra
    };
  }

  private generarPaisDeCapital(banco: CapitalMundo[]): TriviaCapitalesMundo | null {
    const correcta = this.elegirUno(banco);
    if (!correcta) return null;

    const distractores = this.muestraDistinta(
      banco.filter((it) => it.capital !== correcta.capital).map((it) => it.pais),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta.pais, ...distractores]);
    return {
      pregunta: `¿A qué país pertenece la capital ${correcta.capital}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta.pais),
      datoExtra: correcta.datoExtra
    };
  }

  private generarContinenteDePais(banco: CapitalMundo[]): TriviaCapitalesMundo | null {
    const correcta = this.elegirUno(banco);
    if (!correcta) return null;

    const continentes = [...new Set(banco.map((it) => it.continente))];
    const distractores = this.muestraDistinta(
      continentes.filter((it) => it !== correcta.continente),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta.continente, ...distractores]);
    return {
      pregunta: `¿En qué continente se encuentra ${correcta.pais}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta.continente),
      datoExtra: correcta.datoExtra
    };
  }

  private esPreguntaReciente(reto: TriviaCapitalesMundo): boolean {
    const firma = `${reto.pregunta}::${reto.opciones.join('|')}`;
    return this.preguntasRecientes.includes(firma);
  }

  private registrarPreguntaReciente(reto: TriviaCapitalesMundo): void {
    const firma = `${reto.pregunta}::${reto.opciones.join('|')}`;
    this.preguntasRecientes.push(firma);
    if (this.preguntasRecientes.length > this.maxPreguntasRecientes) {
      this.preguntasRecientes.shift();
    }
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
