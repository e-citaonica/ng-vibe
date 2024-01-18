import { OperationAck, OperationWrapper, Selection } from '../models';
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
import {
  EditorView,
  Tooltip,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
  showTooltip,
} from '@codemirror/view';
import { EditorState, StateField, Transaction } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { basicSetup } from 'codemirror';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Queue } from '../queue';
import { transformOperation } from '../transformations';
import { SocketIoService } from '../socket-io.service';
import { Constants } from '../../constants';
import {
  cursorTooltipBaseTheme,
  json1PresenceDisplay,
} from '../user-selection-widget';

export const arr = [0];

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
  socket = inject(SocketIoService);

  @ViewChild('codeMirror') private cm!: ElementRef<HTMLDivElement>;

  doc = signal<Document>({
    id: '',
    content: 'Loading...',
    name: 'Loading...',
    revision: 1,
  });

  view!: EditorView;
  state!: EditorState;
  listenChangesExtension!: StateField<number>;

  presentUsers = new Map<string, string>();

  // All local changes which have not been sent to the server
  pendingChangesQueue = new Queue<OperationWrapper[]>();

  // All local changes sent to the server but have not been acknowledged
  // sentChangesQueue = new Queue<OperationWrapper[]>();

  startedSendingEvents = false;

  selections = new Map<string, Selection>();

  constructor() {}

  transformPendingChangesAgainstIncomingOperation(incoming: OperationWrapper) {
    for (let pendingOpWrappers of this.pendingChangesQueue) {
      const arr: OperationWrapper[] = [];

      for (const pendingOpWrapper of pendingOpWrappers) {
        const transformedOps = transformOperation(
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

  ngAfterViewInit(): void {
    const id = this.route.snapshot.params['id'];

    this.http
      .get<Document>(`${Constants.API_URL}/doc/${id}`)
      .subscribe((doc) => {
        this.socket.connect(id);

        this.setupCodeMirror(doc);
        this.socket.emit('user_joined_doc', localStorage.getItem('user')!);

        this.doc.set(doc);

        this.socket.operation$.subscribe((incomingOp) => {
          console.log('socket operation response:', incomingOp);

          this.transformPendingChangesAgainstIncomingOperation(incomingOp);

          this.doc.update((doc) => ({
            ...doc,
            revision: incomingOp.revision,
          }));

          this.applyOperation(incomingOp);
        });

        this.socket.userJoin$.subscribe((payload) => {
          this.presentUsers.set(payload.socketId, payload.username);
          console.log(payload, 'joined');

          console.log('joinedUsers:', [...this.presentUsers.entries()]);
        });

        this.socket.userLeave$.subscribe((socketId) => {
          this.presentUsers.delete(socketId);

          console.log('joinedUsers:', [...this.presentUsers.entries()]);
        });
      });
  }

  applyOperation(incomingOp: OperationWrapper) {
    if (incomingOp.operation.type === 'insert') {
      this.selections.set(incomingOp.performedBy, {
        docId: incomingOp.docId,
        revision: incomingOp.revision,
        performedBy: incomingOp.performedBy,
        from: incomingOp.operation.position + incomingOp.operation.length,
        to: incomingOp.operation.position + incomingOp.operation.length,
      });

      this.view.dispatch({
        changes: {
          from: incomingOp.operation.position,
          insert: incomingOp.operation.operand!,
        },
      });
    } else {
      this.selections.set(incomingOp.performedBy, {
        docId: incomingOp.docId,
        revision: incomingOp.revision,
        performedBy: incomingOp.performedBy,
        from: incomingOp.operation.position,
        to: incomingOp.operation.position,
      });

      this.view.dispatch({
        changes: {
          from: incomingOp.operation.position,
          to: incomingOp.operation.position + incomingOp.operation.length,
        },
      });
    }
  }

  setupCodeMirror(doc: Document) {
    this.listenChangesExtension = StateField.define({
      create: () => 0,
      update: (value, transaction) =>
        this.listenChangesUpdate(value, transaction),
    });

    // setInterval(() => {
    //   arr.push(arr.length);
    //   this.view.dispatch();
    // }, 1000);

    const getCursorTooltips = (): readonly Tooltip[] => {
      return [...this.selections.entries()].map(([username, selection]) => {
        return {
          pos: selection.to,
          above: true,
          strictSide: true,
          arrow: true,
          create: () => {
            let dom = document.createElement('div');
            dom.className = 'cm-tooltip-cursor';
            dom.textContent = username;
            return { dom };
          },
        };
      });
    };

    const cursorTooltipField = StateField.define<readonly Tooltip[]>({
      create: getCursorTooltips,

      update(tooltips, tr) {
        // if (!tr.docChanged && !tr.selection) return tooltips;
        return getCursorTooltips();
      },

      provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
    });

    this.socket.selection$.subscribe((selection) => {
      this.selections.set(selection.performedBy, selection);
      // TODO: something smarter than manual update trigger
      this.view.dispatch();
    });

    this.socket.userLeave$.subscribe((socketId) => {
      // TODO: username or socketId?
      this.selections.delete(socketId);
      // TODO: something smarter than manual update trigger
      this.view.dispatch();
    });

    this.state = EditorState.create({
      doc: doc.content,
      extensions: [
        basicSetup,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        javascript({ typescript: true }),
        lineNumbers(),
        this.listenChangesExtension,
        json1PresenceDisplay(this.socket.selection$, this.socket.userLeave$),
        [cursorTooltipBaseTheme, cursorTooltipField],
      ],
    });

    this.view = new EditorView({
      state: this.state,
      parent: this.cm.nativeElement,
    });
  }

  ackHandler() {
    return (ackRevision: OperationAck) => {
      console.log('Acknowledgment from server:', ackRevision);

      this.doc.update((doc) => ({ ...doc, revision: ackRevision.revision }));

      for (const operationWrappers of this.pendingChangesQueue) {
        operationWrappers.forEach(
          (wrapper) => (wrapper.revision = ackRevision.revision)
        );
      }

      if (this.pendingChangesQueue.isEmpty()) {
        this.startedSendingEvents = false;
        return;
      }

      this.pendingChangesQueue
        .dequeue()
        .map((op) =>
          this.socket.emitOperation(op).subscribe(this.ackHandler())
        );
    };
  }

  listenChangesUpdate(value: number, transaction: Transaction) {
    const selectionRange = transaction.startState.selection.main;
    const annotation = (transaction as any).annotations[0].value as string;

    if (
      !transaction.docChanged &&
      typeof annotation === 'string' &&
      annotation.startsWith('select')
    ) {
      console.log(transaction);
      const range = transaction.selection!.main;

      console.log(range);

      this.socket.emit<Selection>('selection', {
        docId: this.doc().id,
        revision: this.doc().revision,
        performedBy: localStorage.getItem('user')!,
        from: range.from,
        to: range.to,
      });
    }

    if (transaction.docChanged) {
      if (typeof annotation !== 'string') {
        return value;
      }

      const text: string | undefined = (transaction.changes as any).inserted
        .find((i: any) => i.length > 0)
        ?.text?.join('\n');

      const type = annotation.startsWith('input') ? 'insert' : 'delete';

      const lengthDiff =
        transaction.changes.desc.newLength - transaction.changes.desc.length;

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
          performedBy: localStorage.getItem('user')!,
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
          performedBy: localStorage.getItem('user')!,
          operation: {
            type: 'insert',
            operand: text!,
            position: selectionRange.from,
            length: text!.length,
          },
        };

        console.log({ opDelete, opInsert });

        this.pendingChangesQueue.enqueue([opDelete, opInsert]);

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.pendingChangesQueue
            .dequeue()
            .map((op) =>
              this.socket.emitOperation(op).subscribe(this.ackHandler())
            );
        }
      } else {
        const operation: OperationWrapper = {
          docId: this.doc().id,
          revision: this.doc().revision,
          performedBy: localStorage.getItem('user')!,
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
            .map((op) =>
              this.socket.emitOperation(op).subscribe(this.ackHandler())
            );
        }
      }
    }

    return value + 1;
  }
}
