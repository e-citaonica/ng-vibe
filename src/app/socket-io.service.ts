import { Injectable, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { Observable } from 'rxjs';
import {
  TextSelection,
  OperationAck,
  OperationWrapper,
  UserInfo,
} from './models';
import { Constants } from '../constants';
import { SocketEvent } from './socket-events';

@Injectable({
  providedIn: 'root',
})
export class SocketIoService {
  private socket!: Socket;

  public operation = signal<OperationWrapper | null>(null);

  public connect$ = new Observable<string>();
  public operation$ = new Observable<OperationWrapper>();
  public selection$ = new Observable<TextSelection>();
  public userJoin$ = new Observable<UserInfo>();
  public userLeave$ = new Observable<string>();

  constructor() {}

  connect(docId: string) {
    const username = localStorage.getItem('user');

    this.socket = io(`${Constants.WS_URL}?docId=${docId}&user=${username}`);

    this.connect$ = new Observable<string>((observer) => {
      this.socket.on('connect', () => {
        console.log('Socket.IO connected:', this.socket.id);
        observer.next(this.socket.id);
      });
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

    this.selection$ = new Observable<TextSelection>((observer) => {
      this.socket.on('selection', (selection: string) => {
        const incomingSelection: TextSelection = JSON.parse(selection);

        console.log('Socket selection response:', incomingSelection);

        observer.next(incomingSelection);
      });
    });

    this.userJoin$ = new Observable<UserInfo>((observer) => {
      this.socket.on('user_joined_doc', (payloadStr: string) => {
        const payload: UserInfo = JSON.parse(payloadStr);
        observer.next(payload);
      });
    });

    this.userLeave$ = new Observable<string>((observer) => {
      this.socket.on('user_left_doc', (socketId: string) => {
        console.log('Socket.IO disconnected', socketId);

        observer.next(socketId);
      });
    });
  }

  emitOperation(operation: OperationWrapper) {
    return new Observable<OperationAck>((observer) => {
      this.socket.emit('operation', operation, (ackData: OperationAck) => {
        observer.next(ackData);
      });
    });
  }

  emit<T>(event: SocketEvent, payload: T) {
    this.socket.emit(event, payload);
  }
}
