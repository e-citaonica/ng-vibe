import { javascript } from '@codemirror/lang-javascript';
import {
  Annotation,
  AnnotationType,
  EditorState,
  Prec,
  StateField,
  Transaction,
  TransactionSpec
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
  keymap,
  ViewPlugin
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
  TextSelection
} from '../model/models';
import { Subject, takeUntil } from 'rxjs';
import {
  selectionHover,
  selectionTooltipBaseTheme,
  selectionTooltipField
} from './extensions/selection-hover-tooltip';
import { findFirstWholeWordFromLeft } from '../core/util/helpers';
import {
  EventDescriptor,
  EventSubtype,
  EventType,
  eventSubtypes,
  eventTypeMap,
  eventTypes
} from './model/event.type';
import {
  indentMore,
  insertBlankLine,
  insertNewline,
  lineComment
} from '@codemirror/commands';

export class Editor {
  private view!: EditorView;
  private state!: EditorState;
  private listenChangesExtension!: StateField<number>;

  private isDequeing = false;

  readonly documentState = new DocumentState();

  selection$ = new Subject<TextSelection>();
  dequeuedOperation$ = new Subject<OperationWrapper>();

  private operation$ = new Subject<TextOperation>();
  private onDispose$ = new Subject<void>();

  viewDispatch(...specs: TransactionSpec[]) {
    this.view?.dispatch(...specs);
  }

  init(cm: ElementRef<HTMLDivElement>, doc: Document, injector: Injector) {
    this.documentState.doc.set(doc);

    this.listenChangesExtension = StateField.define({
      create: () => 0,
      update: (value, tr) => {
        this.listenChangesUpdate(value, tr);
        return value + 5;
      }
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
        Prec.highest(
          keymap.of([
            {
              key: 'Tab',
              run: indentMore
            }
          ])
        )
        // TODO: Tooltips on hover
        // [
        //   selectionTooltipField(this.documentBuffer.selections),
        //   selectionTooltipBaseTheme,
        // ],
      ]
    });

    this.operation$.pipe(takeUntil(this.onDispose$)).subscribe((operation) => {
      this.documentState.enqueue({
        docId: this.documentState.doc().id,
        revision: this.documentState.doc().revision,
        performedBy: localStorage.getItem('user')!,
        operation
      });

      this.documentState.transformSelectionsAgainstIncomingOperation(operation);

      if (!this.isDequeing) {
        this.isDequeing = true;
        this.dequeuedOperation$.next(this.documentState.dequeue());
      }
    });

    this.view = new EditorView({
      state: this.state,
      parent: cm.nativeElement
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
      subtype: eventTypeMap[type].find((t) => transaction.isUserEvent(t))
    };
  }

  listenChangesUpdate(value: number, transaction: Transaction) {
    let { origin, type, subtype } = this.getEventType(transaction);
    if (origin === 'dispatch') {
      return;
    }
    let insertedText = '';
    transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      insertedText = insertedText.concat(inserted.toString());
    });
    const { from, to } = transaction.startState.selection.main;

    switch (type) {
      case 'select':
        console.log('select');
        const range = transaction.selection!.main;
        this.selection$.next({
          docId: this.documentState.doc().id,
          revision: this.documentState.doc().revision,
          performedBy: localStorage.getItem('user')!,
          from: from,
          to: to
        });
        break;
      case 'delete':
        subtype = subtype as EventSubtype<typeof type>;

        const length =
          transaction.changes.desc.newLength - transaction.changes.desc.length;
        let position = from;
        if (subtype === 'delete.backward') {
          position += length;
        }
        this.operation$.next({
          length: Math.abs(length),
          operand: null,
          position: position,
          type: 'delete'
        });
        break;
      case 'input':
        subtype = subtype as EventSubtype<typeof type>;

        let insertedText = '';
        transaction.changes.iterChanges(
          (_fromA, _toA, _fromB, _toB, inserted) => {
            insertedText = insertedText.concat(inserted.toString());
          }
        );

        switch (subtype) {
          case 'input.type':
            this.operation$.next({
              type: 'insert',
              position: from,
              operand: insertedText,
              length: insertedText.length
            });
            break;
          case 'input.paste':
            const overLen = to - from;
            console.log('input.pase', overLen);
            if (overLen > 0) {
              this.operation$.next({
                type: 'delete',
                operand: null,
                position: from,
                length: overLen
              });
            }
            this.operation$.next({
              type: 'insert',
              operand: insertedText!,
              position: from,
              length: insertedText.length
            });
            break;
          case 'input.complete':
            insertedText = '';
            transaction.changes.iterChanges(
              (_fromA, _toA, _fromB, _toB, inserted) => {
                insertedText = insertedText.concat(
                  inserted.toString().substring(_toA - _fromA)
                );
              }
            );

            this.operation$.next({
              type: 'insert',
              operand: insertedText,
              length: insertedText.length,
              position: from
            });
            break;
          default:
            const {
              startState: { doc }
            } = transaction;
            const lineFrom = doc.lineAt(from);
            const lineTo = doc.lineAt(to);

            let position = from;
            if (lineFrom !== lineTo && !lineFrom.text.trim().length) {
              position = lineFrom.from;
              insertedText = '\n';
            }

            this.operation$.next({
              type: 'insert',
              position: position,
              operand: insertedText,
              length: insertedText.length
            });
        }
    }
  }

  ackHandler(ackRevision: OperationAck) {
    this.documentState.doc.update((doc) => ({
      ...doc,
      revision: ackRevision.revision
    }));

    this.documentState.updatePendingOperations((value) => ({
      ...value,
      revision: ackRevision.revision
    }));

    if (!this.documentState.hasPending()) {
      this.isDequeing = false;
      return;
    }

    this.dequeuedOperation$.next(this.documentState.dequeue());
  }
}
