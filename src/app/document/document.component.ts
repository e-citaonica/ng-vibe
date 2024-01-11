import { Operation, OperationAck, OperationWrapper } from './transforms';
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
import {
  ChangeSet,
  ChangeSpec,
  EditorState,
  StateField,
  Transaction,
} from '@codemirror/state';
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
  pendingChangesQueue = new Queue<OperationWrapper[]>();

  // All local changes sent to the server but have not been acknowledged
  // sentChangesQueue = new Queue<OperationWrapper[]>();

  startedSendingEvents = false;

  constructor() {
    // this.pendingChangesQueue.enqueue({
    //   ackTo: 'toske',
    //   docId: 'id',
    //   operation: {
    //     type: 'insert',
    //     operand: 'first',
    //     length: 'first'.length,
    //     position: 0,
    //   },
    //   revision: 1,
    // });
    // this.pendingChangesQueue.enqueue({
    //   ackTo: 'toske',
    //   docId: 'id',
    //   operation: {
    //     type: 'insert',
    //     operand: 'second',
    //     length: 'second'.length,
    //     position: 5,
    //   },
    //   revision: 1,
    // });
    // this.pendingChangesQueue.enqueue({
    //   ackTo: 'toske',
    //   docId: 'id',
    //   operation: {
    //     type: 'delete',
    //     operand: null,
    //     length: 1,
    //     position: 'firstsecond'.length,
    //   },
    //   revision: 1,
    // });
    // for (let pendingOp of this.pendingChangesQueue) {
    //   console.log(pendingOp.operation);
    // }
    // this.transformPendingChangesAgainstIncomingChange({
    //   docId: 'id',
    //   revision: 1,
    //   ackTo: 'toske',
    //   operation: {
    //     operand: 'andrija',
    //     position: 0,
    //     type: 'insert',
    //     length: 7,
    //   },
    // });
    // console.log('---');
    // for (let pendingOp of this.pendingChangesQueue) {
    //   console.log(pendingOp.operation);
    // }
  }

  transformPendingChangesAgainstIncomingOperation(incoming: OperationWrapper) {
    for (let pendingOpWrappers of this.pendingChangesQueue) {
      const arr: OperationWrapper[] = [];

      for (const pendingOpWrapper of pendingOpWrappers) {
        const transformedOps = this.transform(
          pendingOpWrapper.operation,
          incoming.operation
        );

        const transformedOpWrappers: OperationWrapper[] = transformedOps.map(
          (op) => ({
            ...pendingOpWrapper,
            revision: incoming.revision,
            operation: op,
          })
        );

        arr.push(...transformedOpWrappers);
      }

      pendingOpWrappers = arr;
    }
  }

  transform(op1: Operation, op2: Operation): Operation[] {
    if (op1.type === 'insert' && op2.type === 'insert') {
      return [this.transformII(op1, op2)];
    } else if (op1.type === 'insert' && op2.type === 'delete') {
      return [this.transformID(op1, op2)];
    } else if (op1.type === 'delete' && op2.type === 'insert') {
      return this.transformDI(op1, op2);
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      return [this.transformDD(op1, op2)];
    } else {
      throw new Error('Transform failed');
    }
  }

  transformII(op1: Operation, op2: Operation): Operation {
    const newPos =
      op1.position < op2.position ? op1.position : op1.position + op2.length;
    return {
      type: op1.type,
      operand: op1.operand,
      position: newPos,
      length: op1.length,
    };
  }

  transformID(op1: Operation, op2: Operation): Operation {
    const op2End = op2.position + op2.length - 1;
    if (op1.position <= op2.position) {
      return {
        type: op1.type,
        operand: op1.operand,
        position: op1.position,
        length: op1.length,
      };
    } else if (op1.position <= op2End) {
      return {
        type: op1.type,
        operand: op1.operand,
        position: op2.position,
        length: op1.length,
      };
    } else {
      return {
        type: op1.type,
        operand: op1.operand,
        position: op1.position - op2.length,
        length: op1.length,
      };
    }
  }

  transformDI(op1: Operation, op2: Operation): Operation[] {
    const op1End = op1.position + op1.length - 1;
    if (op1.position < op2.position) {
      if (op1End < op2.position) {
        return [
          {
            type: op1.type,
            operand: op1.operand,
            position: op1.position,
            length: op1.length,
          },
        ];
      } else {
        const leftLength = op2.position - op1.position;
        const rightLength = op1.length - op2.position + op1.position;
        const left = op1.operand?.substring(0, leftLength);
        const right = op1.operand?.substring(leftLength);

        return [
          {
            type: op1.type,
            operand: left ?? null,
            position: op1.position,
            length: op2.position - op1.position,
          },
          {
            type: op1.type,
            operand: right ?? null,
            position: op1.position + leftLength + op2.length,
            length: rightLength,
          },
        ];
      }
    } else {
      return [
        {
          type: op1.type,
          operand: op1.operand,
          position: op1.position + op2.length,
          length: op1.length,
        },
      ];
    }
  }

  transformDD(op1: Operation, op2: Operation): Operation {
    const op1End = op1.position + op1.length - 1;
    const op2End = op2.position + op2.length - 1;

    if (op1End < op2.position) {
      return {
        type: op1.type,
        operand: op1.operand,
        position: op1.position,
        length: op1.length,
      };
    } else if (op1.position > op2End) {
      return {
        type: op1.type,
        operand: op1.operand,
        position: op1.position - op2.length,
        length: op1.length,
      };
    } else if (op1.position < op2.position) {
      const operand = op1.operand?.substring(0, op2.position - op1.position);
      return {
        type: op1.type,
        operand: operand ?? null,
        position: op1.position,
        length: op2.position - op1.position,
      };
    } else if (op1End > op2End) {
      const diff = op1.position + op1.length - (op2.position + op2.length);
      const operand = op1.operand?.substring(op1.length - diff);
      return {
        type: op1.type,
        operand: operand ?? null,
        position: op2.position,
        length: diff,
      };
    } else {
      return op1;
    }
  }

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

          this.socket.on('operation', (incomingOpStr: string) => {
            const incomingOp: OperationWrapper = JSON.parse(incomingOpStr);

            console.log('socket operation response:', incomingOp);

            this.transformPendingChangesAgainstIncomingOperation(
              incomingOp.operation
            );

            this.doc.update((doc) => ({
              ...doc,
              revision: incomingOp.revision,
            }));

            if (incomingOp.operation.type === 'insert') {
              this.view.dispatch({
                changes: {
                  from: incomingOp.operation.position,
                  insert: incomingOp.operation.operand!,
                },
              });
            } else {
              this.view.dispatch({
                changes: {
                  from: incomingOp.operation.position,
                  to:
                    incomingOp.operation.position + incomingOp.operation.length,
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

      this.doc.update((doc) => ({ ...doc, revision: ackData.revision }));

      if (this.pendingChangesQueue.isEmpty()) {
        this.startedSendingEvents = false;
        return;
      }

      this.pendingChangesQueue
        .dequeue()
        .map((op) => this.socket.emit('operation', op, this.ackHandler()));
    };
  }

  listenChangesUpdate(value: number, transaction: Transaction) {
    if (transaction.docChanged) {
      const annotation = (transaction as any).annotations[0].value as string;
      if (typeof annotation !== 'string') {
        return value;
      }

      const text: string | undefined = (transaction.changes as any).inserted
        .find((i: any) => i.length > 0)
        ?.text?.join('\n');

      const type = annotation.startsWith('input') ? 'insert' : 'delete';

      const lengthDiff =
        transaction.changes.desc.newLength - transaction.changes.desc.length;

      const selectionRange = transaction.startState.selection.ranges[0];
      console.log({
        transaction,
        changes: transaction.changes,
        selectionRange,
        annotation,
        text,
      });

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
          docId: this.doc().id,
          revision: this.doc().revision,
          ackTo: 'toske',
          operation: {
            type: 'delete',
            operand: null,
            position: selectionRange.from,
            length: selectionRange.to - selectionRange.from + 1,
          },
        };

        const opInsert: OperationWrapper = {
          docId: this.doc().id,
          revision: this.doc().revision,
          ackTo: 'toske',
          operation: {
            type: 'insert',
            operand: text!,
            position: selectionRange.from,
            length: text!.length,
          },
        };

        console.log({ opDelete, opInsert });

        this.pendingChangesQueue.enqueue([opDelete]);
        this.pendingChangesQueue.enqueue([opInsert]);

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.pendingChangesQueue
            .dequeue()
            .map((op) => this.socket.emit('operation', op, this.ackHandler()));
        }
      } else {
        const operation: OperationWrapper = {
          docId: this.doc().id,
          revision: this.doc().revision,
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

        this.pendingChangesQueue.enqueue([operation]);
        console.log({ operation });

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.pendingChangesQueue
            .dequeue()
            .map((op) => this.socket.emit('operation', op, this.ackHandler()));
        }
      }
    }

    return value + 1;
  }
}
