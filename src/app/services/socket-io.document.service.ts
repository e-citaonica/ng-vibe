import { Injectable, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { Observable } from 'rxjs';
import { Constants } from '../../constants';
import {
  OperationAck,
  OperationWrapper,
  TextSelection,
  UserInfo,
} from '../model/models';

export type SocketEvent =
  | 'operation'
  | 'connect'
  | 'disconnect'
  | 'selection'
  | 'user_joined_doc'
  | 'user_left_doc';

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
  public userLeave$ = new Observable<UserInfo>();

  constructor() {}

  connect(docId: string) {
    const username = localStorage.getItem('user');

    this.socket = io(`${Constants.WS_URL}?docId=${docId}&username=${username}`);

    this.connect$ = new Observable<string>((observer) => {
      this.socket.on('connect', () => {
        console.log('Socket.IO connected:', this.socket.id);
        observer.next(this.socket.id);
      });
    });

    this.socket.on('operation', (incomingOp: OperationWrapper) => {
      this.operation.set(incomingOp);
    });

    this.operation$ = new Observable<OperationWrapper>((observer) => {
      this.socket.on('operation', (incomingOp: OperationWrapper) => {
        console.log('Socket operation response:', incomingOp);

        observer.next(incomingOp);
      });
    });

    this.selection$ = new Observable<TextSelection>((observer) => {
      this.socket.on('selection', (selection: TextSelection) => {
        observer.next(selection);
      });
    });

    this.userJoin$ = new Observable<UserInfo>((observer) => {
      this.socket.on('user_joined_doc', (payload) => {
        observer.next(payload);
      });
    });

    this.userLeave$ = new Observable<UserInfo>((observer) => {
      this.socket.on('user_left_doc', (payload) => {
        observer.next(payload);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
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
