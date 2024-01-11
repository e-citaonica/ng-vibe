import { Injectable, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { CursorPosition, OperationAck, OperationWrapper } from './operations';
import { SelectionRange } from '@codemirror/state';

@Injectable({
  providedIn: 'root',
})
export class SocketIoService {
  private socket!: Socket;

  public operation = signal<OperationWrapper | null>(null);

  public operation$ = new Observable<OperationWrapper>();
  public selection$ = new Observable<{ from: number; to: number }>();

  constructor() {}

  connect(docId: string) {
    this.socket = io(`ws://localhost:8079?docId=${docId}`);

    this.socket.on('connect', () => {
      console.log('Socket.IO connected:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });

    this.socket.on('operation', (incomingOpStr: string) => {
      const incomingOp: OperationWrapper = JSON.parse(incomingOpStr);

      console.log('socket operation response:', incomingOp);

      this.operation.set(incomingOp);
    });

    this.operation$ = new Observable<OperationWrapper>((observer) => {
      this.socket.on('operation', (incomingOpStr: string) => {
        const incomingOp: OperationWrapper = JSON.parse(incomingOpStr);

        console.log('Socket operation response:', incomingOp);

        observer.next(incomingOp);
      });
    });

    this.selection$ = new Observable<{ from: number; to: number }>(
      (observer) => {
        this.socket.on('selection', (selection: string) => {
          const incomingSelection: { from: number; to: number } =
            JSON.parse(selection);

          console.log('Socket selection response:', incomingSelection);

          observer.next(incomingSelection);
        });
      }
    );
  }

  emitOperation(operation: OperationWrapper) {
    return new Observable<OperationAck>((observer) => {
      this.socket.emit('operation', operation, (ackData: OperationAck) => {
        observer.next(ackData);
      });
    });
  }

  emitSelection(selection: CursorPosition) {
    this.socket.emit('selection', selection);
  }
}
