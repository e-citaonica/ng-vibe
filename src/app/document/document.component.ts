import { OperationWrapper } from './transforms';
import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
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
import { BehaviorSubject } from 'rxjs';
import { CommonModule } from '@angular/common';

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

  doc$ = new BehaviorSubject<Document | null>(null);
  socket!: Socket;

  view!: EditorView;
  state!: EditorState;
  listenChangesExtension!: StateField<null>;

  constructor() {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      console.log(this.cm.nativeElement);
      console.log(this.state, this.view);
    }, 1000);

    this.route.paramMap.subscribe((params) => {
      const id = params.get('id')!;

      this.http
        .get<Document>(`http://localhost:8080/doc/${id}`)
        .subscribe((doc) => {
          this.doc$.next(doc);

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

            const currentDoc = this.doc$.value as Document;
            this.doc$.next({
              ...currentDoc,
              revision: currentDoc.revision,
            });

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
            create: () => null,
            update: (value, transaction) =>
              this.listenChangesUpdate(transaction, doc),
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
            //Please make sure install codemirror@6.0.1
            //If your command was npm install codemirror, will installed 6.65.1(whatever)
            //You will be here.
            console.error(e);
          }
          this.view = new EditorView({
            state: this.state,
            parent: this.cm.nativeElement,
          });
        });
    });
  }

  listenChangesUpdate(transaction: Transaction, doc: Document) {
    if (transaction.docChanged) {
      console.log(transaction);
      console.log(transaction.changes.desc);

      //@ts-ignore
      const annotation = transaction.annotations[0].value as string;
      if (typeof annotation !== 'string') {
        return null;
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
          docId: doc.id,
          revision: doc.revision,
          performedBy: 'toske',
          operation: {
            type: 'delete',
            operand: null,
            position: selectionRange.from,
            length: selectionRange.to - selectionRange.from + 1,
          },
        };

        const opInsert: OperationWrapper = {
          docId: doc.id,
          revision: doc.revision,
          performedBy: 'toske',
          operation: {
            type: 'insert',
            operand: text!,
            position: selectionRange.from,
            length: text!.length,
          },
        };

        console.log({ opDelete, opInsert });

        this.socket.emit('operation', opDelete);
        this.socket.emit('operation', opInsert);
      } else {
        const payload: OperationWrapper = {
          docId: doc.id,
          revision: doc.revision,
          performedBy: 'toske',
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
        console.log(payload);
        this.socket.emit('operation', payload);
      }
      throw new Error('hah');
    }

    return null;
  }
}
