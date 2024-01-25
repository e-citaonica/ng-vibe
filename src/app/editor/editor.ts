import { javascript } from '@codemirror/lang-javascript';
import {
  EditorState,
  StateField,
  Transaction,
  TransactionSpec,
} from '@codemirror/state';
import {
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
import { usersCursorsExtension } from './extensions/selection-widget';
import { DocumentBuffer } from '../core/document-buffer';
import { Document } from '../model/document.model';
import { ElementRef, Injector } from '@angular/core';
import { OperationAck, OperationWrapper, TextSelection } from '../model/models';
import { Subject } from 'rxjs';
import {
  selectionHover,
  selectionTooltipBaseTheme,
  selectionTooltipField,
} from './extensions/selection-hover-tooltip';
import { findFirstWholeWordFromLeft } from '../core/util/helpers';
import {
  EventSubtype,
  EventType,
  eventSubtypes,
  eventTypes,
} from './model/event.type';

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
      update: (value, tr) => {
        this.listenChangesUpdate(value, tr);
        return value + 1;
      },
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
        // TODO: Multiple selections
        // EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        javascript({ typescript: true }),
        lineNumbers(),
        this.listenChangesExtension,
        usersCursorsExtension(injector, this.documentBuffer.selections),
        selectionHover(this.documentBuffer.selections),
        // TODO: Tooltips on hover
        // [
        //   selectionTooltipField(this.documentBuffer.selections),
        //   selectionTooltipBaseTheme,
        // ],
      ],
    });

    this.view = new EditorView({
      state: this.state,
      parent: cm.nativeElement,
    });
  }

  getEventType(
    transaction: Transaction
  ):
    | { origin: 'dispatch'; type?: undefined; subtype?: undefined }
    | { origin: 'user'; type: EventType; subtype?: EventSubtype } {
    const type = eventTypes.find((t) => transaction.isUserEvent(t));
    if (!type) return { origin: 'dispatch' };

    return {
      origin: 'user',
      type,
      subtype: eventSubtypes.find((t) => transaction.isUserEvent(t)),
    };
  }

  listenChangesUpdate(value: number, transaction: Transaction) {
    const { origin, type, subtype } = this.getEventType(transaction);
    if (origin === 'dispatch') return;

    const selectionRange = transaction.startState.selection.main;

    if (!transaction.docChanged && type === 'select') {
      const range = transaction.selection!.main;

      this.selection$.next({
        docId: this.documentBuffer.doc().id,
        revision: this.documentBuffer.doc().revision,
        performedBy: localStorage.getItem('user')!,
        from: range.from,
        to: range.to,
      });

      return;
    }

    if (transaction.docChanged) {
      let text: string | undefined = (transaction.changes as any).inserted
        .find((i: any) => i.length > 0)
        ?.text?.join('\n');
      console.log(text);
      // ...
      const type = text
        ? 'insert'
        : transaction.isUserEvent('input')
        ? 'insert'
        : 'delete';

      if (transaction.isUserEvent('input.complete')) {
        console.log('completeee');
        const partialWord = findFirstWholeWordFromLeft(
          text!,
          selectionRange.from
        );

        console.log({
          text,
          partialWord,
          substr: text!.substring(partialWord.length),
        });

        text = text!.substring(partialWord.length);
      }

      let position;

      if (transaction.isUserEvent('delete.backward')) {
        const lengthDiff =
          transaction.changes.desc.newLength - transaction.changes.desc.length;

        position = selectionRange.from - Math.abs(lengthDiff);
      } else {
        position = selectionRange.from;
      }

      // Paste & replace selection
      if (
        transaction.isUserEvent('input.paste') &&
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

        this.documentBuffer.enqueue(opDelete, opInsert);
        this.documentBuffer.transformSelectionsAgainstIncomingOperation(
          opDelete,
          opInsert
        );
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
        console.log(operation);

        this.documentBuffer.enqueue(operation);
        this.documentBuffer.transformSelectionsAgainstIncomingOperation(
          operation
        );
      }

      if (!this.startedSendingEvents) {
        this.startedSendingEvents = true;

        this.operation$.next(this.documentBuffer.dequeue());
      }
    }

    return;
  }

  ackHandler(ackRevision: OperationAck) {
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
