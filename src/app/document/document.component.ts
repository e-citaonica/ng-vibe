import { OperationAck, OperationWrapper } from './transforms';
import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
export class AppModule {}
import { Document } from './document.model';
import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState, StateField, Transaction } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { basicSetup } from 'codemirror';
import io, { Socket } from 'socket.io-client';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Queue } from '../queue';

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './document.component.html',
  styleUrl: './document.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentComponent implements AfterViewInit {
  http = inject(HttpClient);
  route = inject(ActivatedRoute);

  @ViewChild('codeMirror') private cm!: ElementRef<HTMLDivElement>;

  doc = signal<Document>({
    id: '',
    content: 'Loading...',
    name: 'Loading...',
    revision: 1,
  });

  socket!: Socket;

  view!: EditorView;
  state!: EditorState;
  listenChangesExtension!: StateField<number>;

  // All local changes which have not been sent to the server
  pendingChangesQueue = new Queue<OperationWrapper>();

  // All local changes sent to the server but have not been acknowledged
  sentChangesQueue = new Queue<OperationWrapper>();

  startedSendingEvents = false;

  constructor() {}

  ngAfterViewInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id')!;

      this.http
        .get<Document>(`http://localhost:8080/doc/${id}`)
        .subscribe((doc) => {
          this.doc.set(doc);

          console.log(doc);

          this.socket = io(`ws://localhost:8079?docId=${doc.id}`);

          this.socket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
          });

          this.socket.on('connect', () => {
            console.log('Socket.IO connected:', this.socket.id);
          });

          this.socket.on('operation', (opStr: string) => {
            const op: OperationWrapper = JSON.parse(opStr);

            console.log('socket operation response:', op);

            this.doc.update((doc) => ({ ...doc!, revision: op.revision }));

            if (op.operation.type === 'insert') {
              this.view.dispatch({
                changes: {
                  from: op.operation.position,
                  insert: op.operation.operand!,
                },
              });
            } else {
              this.view.dispatch({
                changes: {
                  from: op.operation.position,
                  to: op.operation.position + op.operation.length,
                },
              });
            }
          });

          this.listenChangesExtension = StateField.define({
            create: () => 0,
            update: (value, transaction) =>
              this.listenChangesUpdate(value, transaction),
          });

          try {
            this.state = EditorState.create({
              doc: doc.content,
              extensions: [
                basicSetup,
                javascript(),
                lineNumbers(),
                this.listenChangesExtension,
              ],
            });
          } catch (e) {
            console.error(e);
          }
          this.view = new EditorView({
            state: this.state,
            parent: this.cm.nativeElement,
          });
        });
    });
  }

  ackHandler() {
    return (ackData: OperationAck) => {
      console.log('Acknowledgment from server:', ackData);

      this.doc.update((doc) => ({ ...doc!, revision: ackData.revision }));

      console.log('Update:', {
        ...this.doc(),
        revision: ackData.revision,
      });

      if (this.pendingChangesQueue.isEmpty()) {
        this.startedSendingEvents = false;
        return;
      }

      this.socket.emit(
        'operation',
        this.pendingChangesQueue.dequeue(),
        this.ackHandler()
      );
    };
  }

  listenChangesUpdate(value: number, transaction: Transaction) {
    if (transaction.docChanged) {
      console.log(transaction);
      console.log(transaction.changes.desc);

      const annotation = (transaction as any).annotations[0].value as string;
      if (typeof annotation !== 'string') {
        return value;
      }

      const text: string | undefined = (transaction.changes as any).inserted
        .find((i: any) => i.length > 0)
        ?.text?.join('\n');

      console.log({ annotation, text });

      const type = annotation.startsWith('input') ? 'insert' : 'delete';

      const lengthDiff =
        transaction.changes.desc.newLength - transaction.changes.desc.length;

      const selectionRange = transaction.startState.selection.ranges[0];
      console.log(selectionRange);

      let position = 0;

      if (annotation === 'delete.backward') {
        position = selectionRange.from - Math.abs(lengthDiff);
      } else {
        position = selectionRange.from;
      }

      // Paste & replace selection
      if (
        annotation === 'input.paste' &&
        selectionRange.to - selectionRange.from > 0
      ) {
        const opDelete: OperationWrapper = {
          docId: this.doc()!.id,
          revision: this.doc()!.revision,
          ackTo: 'toske',
          operation: {
            type: 'delete',
            operand: null,
            position: selectionRange.from,
            length: selectionRange.to - selectionRange.from + 1,
          },
        };

        const opInsert: OperationWrapper = {
          docId: this.doc()!.id,
          revision: this.doc()!.revision,
          ackTo: 'toske',
          operation: {
            type: 'insert',
            operand: text!,
            position: selectionRange.from,
            length: text!.length,
          },
        };

        console.log({ opDelete, opInsert });

        this.pendingChangesQueue.enqueue(opDelete);
        this.pendingChangesQueue.enqueue(opInsert);

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.socket.emit(
            'operation',
            this.pendingChangesQueue.dequeue(),
            this.ackHandler()
          );
        }
      } else {
        const operation: OperationWrapper = {
          docId: this.doc()!.id,
          revision: this.doc()!.revision,
          ackTo: 'toske',
          operation: {
            type: type,
            operand: text ?? null,
            position: position,
            length:
              text?.length ??
              Math.abs(
                transaction.changes.length - transaction.changes.newLength
              ),
          },
        };

        this.pendingChangesQueue.enqueue(operation);
        console.log(operation);

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.socket.emit(
            'operation',
            this.pendingChangesQueue.dequeue(),
            this.ackHandler()
          );
        }
      }
    }

    return value + 1;
  }
}
