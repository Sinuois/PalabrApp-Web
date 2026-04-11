import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AppActionsService {
  private iniciarJuegoSubject = new Subject<void>();
  private nuevoConceptoSubject = new Subject<void>();
  private volverSubject = new Subject<void>();

  readonly iniciarJuego$ = this.iniciarJuegoSubject.asObservable();
  readonly nuevoConcepto$ = this.nuevoConceptoSubject.asObservable();
  readonly volver$ = this.volverSubject.asObservable();

  iniciarJuego(): void {
    this.iniciarJuegoSubject.next();
  }

  nuevoConcepto(): void {
    this.nuevoConceptoSubject.next();
  }

  volver(): void {
    this.volverSubject.next();
  }
}
