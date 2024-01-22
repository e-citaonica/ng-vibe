import { Injectable } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { Observable, Subject, takeUntil } from 'rxjs';
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
  private socket: Socket | undefined;
  private disconnect$ = new Subject<void>();
  private connect$ = new Subject<string>();

  public operation$ = new Subject<OperationWrapper>();
  public selection$ = new Subject<TextSelection>();
  public userJoin$ = new Subject<UserInfo>();
  public userLeave$ = new Subject<UserInfo>();

  setupSocketEvent<T>(
    subject: Subject<T>,
    eventName: SocketEvent,
    callback?: (data: T) => void
  ) {
    this.socket!.on(eventName, (data: T) => {
      callback?.(data);
      subject.next(data);
    });
  }

  connect(docId: string) {
    const username = localStorage.getItem('user')!;

    this.socket = io(`${Constants.WS_URL}?docId=${docId}&username=${username}`);

    this.disconnect$.complete();
    this.disconnect$ = new Subject<void>();

    this.socket.on('connect', () => {
      console.log('Socket.IO connected:', this.socket!.id);
      this.connect$.next(this.socket!.id!);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnect reason:', reason);
    });

    this.setupSocketEvent(this.operation$, 'operation', (op) => {
      console.log('Socket operation response:', op);
    });
    this.setupSocketEvent(this.selection$, 'selection');
    this.setupSocketEvent(this.userJoin$, 'user_joined_doc');
    this.setupSocketEvent(this.userLeave$, 'user_left_doc');

    return this.connect$;
  }

  emitWithAck<T extends object, A extends object>(
    event: SocketEvent,
    payload: T
  ) {
    return new Observable<A>((observer) => {
      this.socket!.emit(event, payload, (ackData: A) => {
        console.log({ event, payload, ackData });
        observer.next(ackData);
        observer.complete();
      });
    });
  }

  emit<T extends object>(event: SocketEvent, payload: T) {
    this.socket!.emit(event, payload);
  }

  disconnect() {
    if (this.socket && this.socket.connected) {
      this.socket.disconnect();
    }
  }
}
