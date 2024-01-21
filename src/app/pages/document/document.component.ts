import {
  OperationAck,
  OperationWrapper,
  TextOperation,
  TextSelection,
  UserInfo,
} from '../../model/models';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
export class AppModule {}
import { Document } from '../../model/document.model';
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
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { transformOperation } from '../../operation-transformations';
import { SocketIoService } from '../../services/socket-io.document.service';
import { Constants } from '../../../constants';
import {
  hashStringToColor,
  cursorTooltipBaseTheme,
  userPresenceExtension,
} from '../../user-selection-widget';
import { transformSelection } from '../../selection-transformations';
import { DocumentService } from '../../services/document.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, take, takeUntil } from 'rxjs';
import { AngularMaterialModule } from '../../angular-material.module';
import { Queue } from '../../util/queue';
import { DocumentBuffer } from './document-buffer';

export const arr = [0];

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [CommonModule, AngularMaterialModule, RouterModule],
  templateUrl: './document.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentComponent implements AfterViewInit, OnDestroy {
  http = inject(HttpClient);
  injector = inject(Injector);
  snackbar = inject(MatSnackBar);
  route = inject(ActivatedRoute);
  socketIOService = inject(SocketIoService);
  documentService = inject(DocumentService);

  private onDestroy$: Subject<void> = new Subject();

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

  presentUsers = new Map<string, UserInfo>();

  pendingChangesQueue = new Queue<OperationWrapper[]>();
  documentBuffer = new DocumentBuffer();
  selections = signal(new Map<string, TextSelection>());

  startedSendingEvents = false;

  // transformPendingOperationsAgainstIncomingOperation(
  //   incoming: OperationWrapper
  // ) {
  //   for (let pendingOpWrappers of this.pendingChangesQueue) {
  //     const arr: OperationWrapper[] = [];

  //     for (const pendingOpWrapper of pendingOpWrappers) {
  //       const transformedOps = transformOperation(
  //         pendingOpWrapper.operation,
  //         incoming.operation
  //       );

  //       const transformedOpWrappers: OperationWrapper[] = transformedOps.map(
  //         (op) => ({
  //           ...pendingOpWrapper,
  //           revision: incoming.revision,
  //           operation: op,
  //         })
  //       );

  //       arr.push(...transformedOpWrappers);
  //     }

  //     pendingOpWrappers = arr;
  //   }
  // }

  transformSelectionsAgainstIncomingOperation(incoming: OperationWrapper) {
    for (const [username, selection] of this.selections().entries()) {
      const before = selection;
      const transformedSelection = transformSelection(
        selection,
        incoming.operation
      );
      this.selections.update(
        (selections) => new Map(selections.set(username, transformedSelection))
      );
      const after = transformedSelection;
      console.log({ before, after });
    }

    // TODO: Unoptimal to manually update
    this.view.dispatch();
  }

  ngAfterViewInit(): void {
    const id = this.route.snapshot.params['id'];
    this.socketIOService.connect(id);

    this.socketIOService.connect$.subscribe((socketId) => {
      this.documentService.get(id).subscribe((doc) => {
        this.setupCodeMirror(doc);

        this.doc.set(doc);

        this.socketIOService.operation$
          .pipe(takeUntil(this.onDestroy$))
          .subscribe((incomingOp) => {
            console.log('socket operation response:', incomingOp);

            this.documentBuffer.transformPendingOperationsAgainstIncomingOperation(
              incomingOp
            );
            this.transformSelectionsAgainstIncomingOperation(incomingOp);

            this.doc.update((doc) => ({
              ...doc,
              revision: incomingOp.revision,
            }));

            this.applyOperation(incomingOp);
          });

        this.socketIOService.selection$
          .pipe(takeUntil(this.onDestroy$))
          .subscribe((selection) => {
            this.selections.update(
              (selections) =>
                new Map(selections.set(selection.performedBy, selection))
            );
          });

        this.socketIOService.userJoin$
          .pipe(takeUntil(this.onDestroy$))
          .subscribe((payload) => {
            this.presentUsers.set(payload.sessionId, payload);

            this.snackbar.open(`${payload.username} joined!`, 'Info', {
              horizontalPosition: 'center',
              verticalPosition: 'top',
              duration: 3000,
              panelClass: ['green-snackbar'],
            });

            console.log('Present users:', [...this.presentUsers.entries()]);
          });

        this.socketIOService.userLeave$
          .pipe(takeUntil(this.onDestroy$))
          .subscribe((payload) => {
            this.snackbar.open(`${payload.username} left!`, 'Info', {
              horizontalPosition: 'center',
              verticalPosition: 'top',
              duration: 3000,
              panelClass: ['green-snackbar'],
            });

            this.presentUsers.delete(payload.sessionId);

            console.log('Present users:', [...this.presentUsers.entries()]);

            this.selections.update((selections) => {
              selections.delete(socketId);
              return new Map(selections);
            });
          });
      });
    });
  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
    this.socketIOService.disconnect();
  }

  applyOperation(incomingOp: OperationWrapper) {
    if (incomingOp.operation.type === 'insert') {
      this.selections.update(
        (selections) =>
          new Map(
            selections.set(incomingOp.performedBy, {
              docId: incomingOp.docId,
              revision: incomingOp.revision,
              performedBy: incomingOp.performedBy,
              from: incomingOp.operation.position + incomingOp.operation.length,
              to: incomingOp.operation.position + incomingOp.operation.length,
            })
          )
      );

      this.view.dispatch({
        changes: {
          from: incomingOp.operation.position,
          insert: incomingOp.operation.operand!,
        },
      });
    } else {
      this.selections.update(
        (selections) =>
          new Map(
            selections.set(incomingOp.performedBy, {
              docId: incomingOp.docId,
              revision: incomingOp.revision,
              performedBy: incomingOp.performedBy,
              from: incomingOp.operation.position,
              to: incomingOp.operation.position,
            })
          )
      );

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

    const getCursorTooltips = (): readonly Tooltip[] => {
      return [...this.selections().entries()].map(([username, selection]) => {
        return {
          pos: selection.to,
          above: true,
          strictSide: true,
          arrow: true,
          create: () => {
            const dom = document.createElement('div');
            dom.className = 'cm-tooltip-cursor';
            dom.id = username;
            dom.style.backgroundColor = hashStringToColor(username);
            dom.style.color = 'black';

            // setTimeout(() => {
            //   (
            //     document.querySelector(
            //       `#${username} .cm-tooltip-arrow:before`
            //     ) as any
            //   ).style.setProperty(
            //     'border-top',
            //     `7px solid ${hashStringToColor(username)}`
            //   );
            // }, 0);

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

    this.socketIOService.selection$.subscribe((selection) => {
      this.selections.update(
        (selections) =>
          new Map(selections.set(selection.performedBy, selection))
      );
      // TODO: Something smarter than manual update trigger
      this.view.dispatch();
    });

    this.socketIOService.userLeave$.subscribe((payload) => {
      // TODO: Username or socketId?
      this.selections.update((selections) => {
        selections.delete(payload.sessionId);
        return new Map(selections);
      });
      // TODO: Something smarter than manual update trigger
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
        userPresenceExtension(this.injector, this.selections),
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

      this.documentBuffer.updatePendingOperations((value) => ({
        ...value,
        revision: ackRevision.revision,
      }));

      if (!this.documentBuffer.hasPending()) {
        this.startedSendingEvents = false;
        return;
      }

      this.socketIOService
        .emitOperation(this.documentBuffer.dequeue())
        .subscribe(this.ackHandler());
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
      const range = transaction.selection!.main;
      this.socketIOService.emit<TextSelection>('selection', {
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

        this.documentBuffer.enqueue(opDelete, opInsert);
        this.transformSelectionsAgainstIncomingOperation(opDelete);
        this.transformSelectionsAgainstIncomingOperation(opInsert);

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;
          this.socketIOService
            .emitOperation(this.documentBuffer.dequeue())
            .subscribe(this.ackHandler());
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

        this.documentBuffer.enqueue(operation);
        this.transformSelectionsAgainstIncomingOperation(operation);

        console.log({ operation });

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;
          this.socketIOService
            .emitOperation(this.documentBuffer.dequeue())
            .subscribe(this.ackHandler());
        }
      }
    }

    return value + 1;
  }
}
