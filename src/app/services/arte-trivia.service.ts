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
      imagenUrl: 'https://es.wikipedia.org/wiki/La_noche_estrellada#/media/Archivo:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
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
      imagenUrl: 'https://es.wikipedia.org/wiki/La_joven_de_la_perla#/media/Archivo:Meisje_met_de_parel.jpg',
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
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/61/El_nacimiento_de_Venus%2C_por_Sandro_Botticelli.jpg',
      datoExtra: 'Es una obra clave del Renacimiento italiano.'
    },
    {
      titulo: 'La gran ola de Kanagawa',
      autor: 'Katsushika Hokusai',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/The_Great_Wave_off_Kanagawa.jpg',
      datoExtra: 'Es una estampa iconica de la serie Treinta y seis vistas del monte Fuji.'
    },
    {
      titulo: 'La escuela de Atenas',
      autor: 'Rafael',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/49/%22The_School_of_Athens%22_by_Raffaello_Sanzio_da_Urbino.jpg',
      datoExtra: 'Representa a grandes filosofos clasicos en una composicion renacentista.'
    },
    {
      titulo: 'La creación de Adán',
      autor: 'Miguel Angel',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
      datoExtra: 'Es uno de los frescos mas famosos del techo de la Capilla Sixtina.'
    },
    {
      titulo: 'La ronda de noche',
      autor: 'Rembrandt',
      imagenUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/La_ronda_de_noche%2C_por_Rembrandt_van_Rijn.jpg',
      datoExtra: 'Su titulo original es La compania militar del capitan Frans Banning Cocq.'
    },
    {
      titulo: 'El beso',
      autor: 'Gustav Klimt',
      imagenUrl: 'https://es.wikipedia.org/wiki/El_beso_%28Gustav_Klimt%29#/media/Archivo:The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
      datoExtra: 'Pertenece al periodo dorado de Klimt y destaca por su decoracion en pan de oro.'
    },
    {
      titulo: 'El caminante sobre el mar de nubes',
      autor: 'Caspar David Friedrich',
      imagenUrl: 'https://es.wikipedia.org/wiki/El_caminante_sobre_el_mar_de_nubes#/media/Archivo:Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg',
      datoExtra: 'Es una imagen emblematicamente romantica del siglo XIX.'
    },
    {
      titulo: 'Nighthawks',
      autor: 'Edward Hopper',
      imagenUrl: 'https://es.wikipedia.org/wiki/Nighthawks#/media/Archivo:Nighthawks_by_Edward_Hopper_1942.jpg',
      datoExtra: 'Retrata una escena nocturna urbana con una fuerte sensacion de aislamiento.'
    },
    {
      titulo: 'American Gothic',
      autor: 'Grant Wood',
      imagenUrl: 'https://es.wikipedia.org/wiki/American_Gothic#/media/Archivo:Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg',
      datoExtra: 'Es una de las pinturas mas reconocibles del arte estadounidense.'
    },
    {
      titulo: 'Autorretrato de Van Gogh',
      autor: 'Vincent van Gogh',
      imagenUrl: 'https://es.wikipedia.org/wiki/Vincent_van_Gogh#/media/Archivo:Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_(454045).jpg',
      datoExtra: 'Van Gogh realizo numerosos autorretratos durante sus anos en Paris.'
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
