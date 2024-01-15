import {
  OperationAck,
  OperationWrapper,
  Selection,
  UserJoinedPayload,
} from '../models';
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

  // All local changes which have not been sent to the server
  pendingChangesQueue = new Queue<OperationWrapper[]>();

  // All local changes sent to the server but have not been acknowledged
  // sentChangesQueue = new Queue<OperationWrapper[]>();

  pointers = new Map<string, number>();
  joinedUsers = new Map<string, string>();

  startedSendingEvents = false;

  getCursorTooltips(state: EditorState): readonly Tooltip[] {
    return state.selection.ranges
      .filter((range) => range.empty)
      .map((range) => {
        let line = state.doc.lineAt(range.head);
        let text = line.number + ':' + (range.head - line.from);
        return {
          pos: range.head,
          above: true,
          strictSide: true,
          arrow: true,
          create: () => {
            let dom = document.createElement('div');
            dom.className = 'cm-tooltip-cursor';
            dom.textContent = text;
            return { dom };
          },
        };
      });
  }

  constructor() {
    const cursorTooltipField = StateField.define<readonly Tooltip[]>({
      create: this.getCursorTooltips,

      update(tooltips, tr) {
        if (!tr.docChanged && !tr.selection) return tooltips;
        return getCursorTooltips(tr.state);
      },

      provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
    });
  }

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
        this.socket.emit('user_joined_doc', 'toske');

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
          this.joinedUsers.set(payload.socketId, payload.username);
          console.log(payload, 'joined');

          console.log('joinedUsers:', [...this.joinedUsers.entries()]);
        });

        this.socket.userLeave$.subscribe((socketId) => {
          this.joinedUsers.delete(socketId);

          console.log('joinedUsers:', [...this.joinedUsers.entries()]);
        });
      });
  }

  applyOperation(incomingOp: OperationWrapper) {
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
          to: incomingOp.operation.position + incomingOp.operation.length,
        },
      });
    }

    this.pointers.set(incomingOp.performedBy, incomingOp.operation.position);
  }

  setupCodeMirror(doc: Document) {
    this.listenChangesExtension = StateField.define({
      create: () => 0,
      update: (value, transaction) =>
        this.listenChangesUpdate(value, transaction),
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
    const selectionRange = transaction.startState.selection.ranges[0];
    const annotation = (transaction as any).annotations[0].value as string;

    if (!transaction.docChanged && annotation === 'select.pointer') {
      console.log(transaction);

      this.socket.emit<Selection>('selection', {
        docId: this.doc().id,
        from: selectionRange.from,
        to: selectionRange.to,
        performedBy: 'toske',
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
          performedBy: 'toske',
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
          performedBy: 'toske',
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
function getCursorTooltips(state: EditorState): readonly Tooltip[] {
  throw new Error('Function not implemented.');
}
