import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface TriviaCiencia {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
}

export type DificultadTriviaCiencia = 'aleatoria' | 'facil' | 'media' | 'dificil';

type PreguntaCiencia = {
  pregunta: string;
  correcta: string;
  distractores: string[];
  datoExtra?: string;
  dificultad: Exclude<DificultadTriviaCiencia, 'aleatoria'>;
};

@Injectable({ providedIn: 'root' })
export class CienciaTriviaService {
  private http = inject(HttpClient);
  private banco: PreguntaCiencia[] | null = null;
  private cargaEnCurso: Promise<PreguntaCiencia[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;

  async generarPregunta(dificultad: DificultadTriviaCiencia = 'aleatoria'): Promise<TriviaCiencia | null> {
    const bancoCompleto = await this.cargarBanco();
    const banco = dificultad === 'aleatoria'
      ? bancoCompleto
      : bancoCompleto.filter((item) => item.dificultad === dificultad);
    if (banco.length < 1) return null;

    let fallback: TriviaCiencia | null = null;
    const orden = this.barajar(banco);

    for (const base of orden) {
      if (base.distractores.length < 3) continue;

      const opciones = this.barajar([base.correcta, ...base.distractores.slice(0, 3)]);
      const reto: TriviaCiencia = {
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

  async obtenerTotalDisponible(dificultad: DificultadTriviaCiencia = 'aleatoria'): Promise<number> {
    const banco = await this.cargarBanco();
    if (dificultad === 'aleatoria') return banco.length;
    return banco.filter((item) => item.dificultad === dificultad).length;
  }

  private async cargarBanco(): Promise<PreguntaCiencia[]> {
    if (this.banco) return this.banco;
    if (this.cargaEnCurso) return this.cargaEnCurso;

    this.cargaEnCurso = firstValueFrom(this.http.get('data/ciencia-trivia.txt', { responseType: 'text' }))
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

  private parsearFuente(contenido: string): PreguntaCiencia[] {
    const banco: PreguntaCiencia[] = [];

    const lineas = contenido
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea && !linea.startsWith('#'));

    for (const linea of lineas) {
      const partes = linea.split('|').map((p) => p.trim());
      if (partes[0] !== 'Q' || partes.length < 6) continue;

      const { textoPregunta, dificultadMarcada } = this.extraerDificultadDesdePregunta(partes[1]);
      const pregunta = textoPregunta;
      const correcta = partes[2];
      const distractores = [partes[3], partes[4], partes[5]].filter(Boolean);
      const datoExtra = partes[6] || undefined;
      const dificultad = dificultadMarcada ?? this.clasificarDificultad(pregunta, datoExtra);

      if (!pregunta || !correcta || distractores.length < 3) continue;
      banco.push({ pregunta, correcta, distractores, datoExtra, dificultad });
    }

    return banco;
  }

  private esPreguntaReciente(reto: TriviaCiencia): boolean {
    return this.preguntasRecientes.includes(reto.pregunta);
  }

  private registrarPreguntaReciente(reto: TriviaCiencia): void {
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

  private extraerDificultadDesdePregunta(raw: string): {
    textoPregunta: string;
    dificultadMarcada: Exclude<DificultadTriviaCiencia, 'aleatoria'> | null;
  } {
    const texto = raw.trim();
    if (texto.startsWith('[F]')) {
      return { textoPregunta: texto.slice(3).trim(), dificultadMarcada: 'facil' };
    }
    if (texto.startsWith('[M]')) {
      return { textoPregunta: texto.slice(3).trim(), dificultadMarcada: 'media' };
    }
    if (texto.startsWith('[D]')) {
      return { textoPregunta: texto.slice(3).trim(), dificultadMarcada: 'dificil' };
    }

    return { textoPregunta: texto, dificultadMarcada: null };
  }

  private clasificarDificultad(
    pregunta: string,
    datoExtra?: string
  ): Exclude<DificultadTriviaCiencia, 'aleatoria'> {
    const texto = this.normalizar(`${pregunta} ${datoExtra ?? ''}`);

    if (/(cuantic|planck|de broglie|isomer|codon|estereoisomer|gutenberg|subduccion|hawking|agujero negro|materia oscura|uai|funcion de onda|espectro electromagnetico|rayos gamma)/.test(texto)) {
      return 'dificil';
    }

    if (/(mitosis|meiosis|adn|arn|replicacion|transcripcion|termodinamica|bohr|rutherford|maxwell|newton|copernico|kepler|radiacion|fotosintesis|estratosfera|enlace|isotop|sismograf|ozono)/.test(texto)) {
      return 'media';
    }

    return 'facil';
  }

  private normalizar(valor: string): string {
    return valor
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
