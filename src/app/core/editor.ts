import { javascript } from '@codemirror/lang-javascript';
import {
  EditorState,
  StateField,
  Transaction,
  TransactionSpec,
} from '@codemirror/state';
import {
  Tooltip,
  showTooltip,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view';
import { EditorView, basicSetup } from 'codemirror';
import {
  hashStringToColor,
  userPresenceExtension,
  cursorTooltipBaseTheme,
} from '../pages/document/user-selection-widget';
import { DocumentBuffer } from './document-buffer';
import { Document } from '../model/document.model';
import { ElementRef, Injector } from '@angular/core';
import { OperationAck, OperationWrapper, TextSelection } from '../model/models';
import { Subject } from 'rxjs';

export class Editor {
  private view!: EditorView;
  private state!: EditorState;
  private listenChangesExtension!: StateField<number>;

  private startedSendingEvents = false;

  readonly documentBuffer = new DocumentBuffer();

  selection$ = new Subject<TextSelection>();
  operation$ = new Subject<OperationWrapper>();

  viewDispatch(...specs: TransactionSpec[]) {
    this.view.dispatch(...specs);
  }

  init(cm: ElementRef<HTMLDivElement>, doc: Document, injector: Injector) {
    this.documentBuffer.doc.set(doc);

    this.listenChangesExtension = StateField.define({
      create: () => 0,
      update: (value, tr) => this.listenChangesUpdate(value, tr),
    });

    const getCursorTooltips = (): readonly Tooltip[] => {
      return [...this.documentBuffer.selections().entries()].map(
        ([username, selection]) => {
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
        }
      );
    };

    const cursorTooltipField = StateField.define<readonly Tooltip[]>({
      // @ts-ignore
      create: getCursorTooltips,

      update(tooltips, tr) {
        return getCursorTooltips();
      },

      provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
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
        userPresenceExtension(injector, this.documentBuffer.selections),
        [cursorTooltipBaseTheme, cursorTooltipField],
      ],
    });

    this.view = new EditorView({
      state: this.state,
      parent: cm.nativeElement,
    });
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

      this.selection$.next({
        docId: this.documentBuffer.doc().id,
        revision: this.documentBuffer.doc().revision,
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
          docId: this.documentBuffer.doc().id,
          revision: this.documentBuffer.doc().revision,
          performedBy: localStorage.getItem('user')!,
          operation: {
            type: 'delete',
            operand: null,
            position: selectionRange.from,
            length: selectionRange.to - selectionRange.from + 1,
          },
        };

        const opInsert: OperationWrapper = {
          docId: this.documentBuffer.doc().id,
          revision: this.documentBuffer.doc().revision,
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
        this.documentBuffer.transformSelectionsAgainstIncomingOperation(
          opDelete
        );
        this.documentBuffer.transformSelectionsAgainstIncomingOperation(
          opInsert
        );

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.operation$.next(this.documentBuffer.dequeue());
        }
      } else {
        const operation: OperationWrapper = {
          docId: this.documentBuffer.doc().id,
          revision: this.documentBuffer.doc().revision,
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
        this.documentBuffer.transformSelectionsAgainstIncomingOperation(
          operation
        );

        console.log({ operation });

        if (!this.startedSendingEvents) {
          this.startedSendingEvents = true;

          this.operation$.next(this.documentBuffer.dequeue());
        }
      }
    }

    return value + 1;
  }

  ackHandler(ackRevision: OperationAck) {
    console.log('Acknowledgment from server:', ackRevision);

    this.documentBuffer.doc.update((doc) => ({
      ...doc,
      revision: ackRevision.revision,
    }));

    this.documentBuffer.updatePendingOperations((value) => ({
      ...value,
      revision: ackRevision.revision,
    }));

    if (!this.documentBuffer.hasPending()) {
      this.startedSendingEvents = false;
      return;
    }

    this.operation$.next(this.documentBuffer.dequeue());
  }
}
