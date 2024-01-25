import { javascript } from '@codemirror/lang-javascript';
import {
  Annotation,
  AnnotationType,
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
import { DocumentState } from './document-state';
import { Document } from '../model/document.model';
import { ElementRef, Injector } from '@angular/core';
import {
  OperationAck,
  OperationWrapper,
  TextOperation,
  TextSelection,
} from '../model/models';
import { Subject, takeUntil } from 'rxjs';
import {
  selectionHover,
  selectionTooltipBaseTheme,
  selectionTooltipField,
} from './extensions/selection-hover-tooltip';
import { findFirstWholeWordFromLeft } from '../core/util/helpers';
import {
  EventDescriptor,
  EventSubtype,
  EventType,
  eventSubtypes,
  eventTypeMap,
  eventTypes,
} from './model/event.type';

export class Editor {
  private view!: EditorView;
  private state!: EditorState;
  private listenChangesExtension!: StateField<number>;

  private isDequing = false;

  readonly documentState = new DocumentState();

  selection$ = new Subject<TextSelection>();
  dequeuedOperation$ = new Subject<OperationWrapper>();

  private operation$ = new Subject<TextOperation>();
  private onDispose$ = new Subject<void>();

  viewDispatch(...specs: TransactionSpec[]) {
    this.view.dispatch(...specs);
  }

  init(cm: ElementRef<HTMLDivElement>, doc: Document, injector: Injector) {
    this.documentState.doc.set(doc);

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
        usersCursorsExtension(injector, this.documentState.selections),
        selectionHover(this.documentState.selections),
        // TODO: Tooltips on hover
        // [
        //   selectionTooltipField(this.documentBuffer.selections),
        //   selectionTooltipBaseTheme,
        // ],
      ],
    });

    this.operation$.pipe(takeUntil(this.onDispose$)).subscribe((operation) => {
      console.log('enquing', operation);
      this.documentState.enqueue({
        docId: this.documentState.doc().id,
        revision: this.documentState.doc().revision,
        performedBy: localStorage.getItem('user')!,
        operation,
      });

      if (!this.isDequing) {
        this.isDequing = true;
        this.dequeuedOperation$.next(this.documentState.dequeue());
      }
    });

    this.view = new EditorView({
      state: this.state,
      parent: cm.nativeElement,
    });
  }

  dispose() {
    this.onDispose$.next();
    this.onDispose$.complete();
  }

  getEventType(transaction: Transaction): EventDescriptor {
    const type = eventTypes.find((t) => transaction.isUserEvent(t));

    if (!type) {
      const fallback = (transaction as any).annotations.find(
        (annotation: any) => annotation.value.type === 'keyword'
      );
      return fallback
        ? { origin: 'user', type: 'input', subtype: 'input.complete' }
        : { origin: 'dispatch' };
    }

    return {
      origin: 'user',
      type,
      subtype: eventTypeMap[type].find((t) => transaction.isUserEvent(t)),
    };
  }

  listenChangesUpdate(value: number, transaction: Transaction) {
    let { origin, type, subtype } = this.getEventType(transaction);
    if (origin === 'dispatch') {
      return;
    }

    const selectionRange = transaction.startState.selection.main;

    switch (type) {
      case 'select':
        const range = transaction.selection!.main;
        this.selection$.next({
          docId: this.documentState.doc().id,
          revision: this.documentState.doc().revision,
          performedBy: localStorage.getItem('user')!,
          from: range.from,
          to: range.to,
        });
        break;
      case 'delete':
        subtype = subtype as EventSubtype<typeof type>;

        const length =
          transaction.changes.desc.newLength - transaction.changes.desc.length;
        let position = selectionRange.from;
        if (subtype === 'delete.backward') {
          position -= Math.abs(length);
        }

        this.operation$.next({
          length: Math.abs(length),
          operand: null,
          position: position,
          type: 'delete',
        });
        break;
      case 'input':
        subtype = subtype as EventSubtype<typeof type>;
        let insertedText = '';
        transaction.changes.iterChanges(
          (_fromA, _toA, _fromB, _toB, inserted) => {
            console.log(_fromA, _toA, _fromB, _toB, inserted);
            insertedText = insertedText.concat(inserted.toString());
          }
        );

        switch (subtype) {
          case 'input.type':
            this.operation$.next({
              type: 'insert',
              position: selectionRange.from,
              operand: insertedText,
              length: insertedText.length,
            });
            break;
          case 'input.paste':
            const overLen = selectionRange.to - selectionRange.from;
            if (overLen > 0) {
              this.operation$.next({
                type: 'delete',
                operand: null,
                position: selectionRange.from,
                length: overLen,
              });
            }
            this.operation$.next({
              type: 'insert',
              operand: insertedText!,
              position: selectionRange.from,
              length: insertedText.length,
            });
            break;
          case 'input.complete':
            insertedText = '';
            transaction.changes.iterChanges(
              (_fromA, _toA, _fromB, _toB, inserted) => {
                const completed = inserted.toString().substring(_toA - _fromA);
                insertedText = insertedText.concat(completed);
              }
            );
            this.operation$.next({
              type: 'insert',
              operand: insertedText,
              length: insertedText.length,
              position: selectionRange.from,
            });
            break;
          default:
            this.operation$.next({
              type: 'insert',
              position: selectionRange.from,
              operand: insertedText,
              length: insertedText.length,
            });
        }
    }
  }

  ackHandler(ackRevision: OperationAck) {
    this.documentState.doc.update((doc) => ({
      ...doc,
      revision: ackRevision.revision,
    }));

    this.documentState.updatePendingOperations((value) => ({
      ...value,
      revision: ackRevision.revision,
    }));

    if (!this.documentState.hasPending()) {
      this.isDequing = false;
      return;
    }

    this.dequeuedOperation$.next(this.documentState.dequeue());
  }
}
