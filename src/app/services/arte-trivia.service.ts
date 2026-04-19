import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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

type PinturaArte = {
  titulo: string;
  autor: string;
  imagenUrl: string;
  datoExtra?: string;
};

@Injectable({ providedIn: 'root' })
export class ArteTriviaService {
  private http = inject(HttpClient);
  private banco: PreguntaArte[] | null = null;
  private cargaEnCurso: Promise<PreguntaArte[]> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;
  private readonly pinturas: PinturaArte[] = [
    {
      titulo: 'La noche estrellada',
      autor: 'Vincent van Gogh',
      imagenUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/The_Starry_Night.jpg',
      datoExtra: 'Van Gogh la pinto en 1889 desde su habitacion en Saint-Remy.'
    },
    {
      titulo: 'La Gioconda',
      autor: 'Leonardo da Vinci',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Mona_Lisa.jpg',
      datoExtra: 'Tambien conocida como Mona Lisa, se exhibe en el Louvre.'
    },
    {
      titulo: 'El grito',
      autor: 'Edvard Munch',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/The_Scream.jpg',
      datoExtra: 'Munch realizo varias versiones de esta composicion.'
    },
    {
      titulo: 'La joven de la perla',
      autor: 'Johannes Vermeer',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Meisje_met_de_parel.jpg',
      datoExtra: 'Es conocida como la Mona Lisa del norte.'
    },
    {
      titulo: 'Guernica',
      autor: 'Pablo Picasso',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/en/7/74/PicassoGuernica.jpg',
      datoExtra: 'Es una denuncia artistica contra la guerra y la violencia.'
    },
    {
      titulo: 'La persistencia de la memoria',
      autor: 'Salvador Dali',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/en/d/dd/The_Persistence_of_Memory.jpg',
      datoExtra: 'Sus relojes blandos son iconos del surrealismo.'
    },
    {
      titulo: 'Las meninas',
      autor: 'Diego Velazquez',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Las_Meninas_01.jpg',
      datoExtra: 'Incluye un autorretrato del propio Velazquez en escena.'
    },
    {
      titulo: 'El nacimiento de Venus',
      autor: 'Sandro Botticelli',
      imagenUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg',
      datoExtra: 'Es una obra clave del Renacimiento italiano.'
    }
  ];

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

    const distractores = this.muestraDistinta(
      this.pinturas.filter((p) => p.titulo !== correcta.titulo).map((p) => p.titulo),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta.titulo, ...distractores]);
    return {
      pregunta: '¿Que pintura es esta?',
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta.titulo),
      imagenUrl: correcta.imagenUrl,
      datoExtra: correcta.datoExtra ? `${correcta.datoExtra} Autor: ${correcta.autor}.` : `Autor: ${correcta.autor}.`
    };
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
