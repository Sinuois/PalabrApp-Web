import { Component, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PalabrasService } from '../../services/palabras.service';
import { Palabra } from '../../interfaces/app.interfaces';

@Component({
  selector: 'app-buscar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './buscar.component.html',
  styleUrls: ['./buscar.component.scss']
})
export class BuscarComponent {

  termino = signal('');

  resultados = computed<Palabra[]>(() => {
    const t = this.normalizarTexto(this.termino().trim());
    if (!t) return [];
    return this.palabrasService.palabras().filter(p =>
      this.normalizarTexto(p.concepto).includes(t) ||
      this.normalizarTexto(p.significado).includes(t)
    ).sort((a, b) => {
      const aNormConcepto = this.normalizarTexto(a.concepto);
      const bNormConcepto = this.normalizarTexto(b.concepto);
      
      const aComienza = aNormConcepto.startsWith(t);
      const bComienza = bNormConcepto.startsWith(t);
      const aContiene = aNormConcepto.includes(t);
      const bContiene = bNormConcepto.includes(t);
      
      // 1. Prioridad: comienzan con el término
      if (aComienza && !bComienza) return -1;
      if (!aComienza && bComienza) return 1;
      
      // 2. Si ambos comienzan (o ninguno), priorizar por longitud (más corto = mejor match)
      if (aComienza && bComienza) {
        return a.concepto.length - b.concepto.length;
      }
      
      // 3. Si ninguno comienza, pero uno contiene en concepto
      if (aContiene && !bContiene) return -1;
      if (!aContiene && bContiene) return 1;
      
      return 0;
    });
  });

  constructor(
    public palabrasService: PalabrasService,
    private router: Router
  ) {}

  buscar(termino: string): void {
    this.termino.set(termino);
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.buscar(input?.value ?? '');
  }

  private normalizarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  verPalabra(p: Palabra): void {
    this.router.navigate(['/palabra', p._id], {
      state: { concepto: p.concepto, significado: p.significado }
    });
  }

  trackById(_: number, p: Palabra) { return p._id; }
}
