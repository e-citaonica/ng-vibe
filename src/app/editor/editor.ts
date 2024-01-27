import { languages } from '@codemirror/language-data';

import {
  EditorState,
  Prec,
  StateEffect,
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
  keymap
} from '@codemirror/view';
import { EditorView, basicSetup } from 'codemirror';
import { usersCursorsExtension } from './extensions/selection-widget';
import { DocumentState } from './document-state';
import { Document } from '../model/document.model';
import { ElementRef, Injector, effect } from '@angular/core';
import {
  OperationAck,
  OperationWrapper,
  TextOperation,
  TextSelection
} from '../model/models';
import { Subject, takeUntil } from 'rxjs';
import { selectionHover } from './extensions/selection-hover-tooltip';
import {
  EventDescriptor,
  EventSubtype,
  eventTypeMap,
  eventTypes
} from './model/event.type';
import { indentMore, insertTab } from '@codemirror/commands';

export class Editor {
  private view!: EditorView;
  private state!: EditorState;
  private listenChangesExtension!: StateField<number>;

  language = '';

  private isDequeing = false;

  readonly documentState = new DocumentState();

  selection$ = new Subject<TextSelection>();
  dequeuedOperation$ = new Subject<OperationWrapper>();

  private operation$ = new Subject<TextOperation>();
  private onDispose$ = new Subject<void>();

  viewDispatch(...specs: TransactionSpec[]) {
    this.view?.dispatch(...specs);
  }

  setDocument(doc: Document) {
    this.isDequeing = false;
    this.documentState.clear();
  }

  init(cm: ElementRef<HTMLDivElement>, doc: Document, injector: Injector) {
    this.documentState.doc.set(doc);

    this.language = doc.language;
    this.language = 'C#'; // TODO: Delete this

    const language = languages.find((l) => l.name === this.language)!;

    language.load().then((languageSupport) => {
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
          highlightActiveLine(),
          languageSupport.extension,
          lineNumbers(),
          this.listenChangesExtension,
          usersCursorsExtension(injector, this.documentState.selections),
          selectionHover(this.documentState.selections),
          Prec.highest(
            keymap.of([
              {
                key: 'Tab',
                run: insertTab
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

      this.view = new EditorView({
        state: this.state,
        parent: cm.nativeElement
      });
    });

    this.listenChangesExtension = StateField.define({
      create: () => 0,
      update: (value, tr) => {
        this.listenChangesUpdate(value, tr);
        return value + 5;
      }
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
      console.log('fallback', fallback);

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

    const {
      startState: {
        doc,
        selection: {
          main: { from, to, anchor }
        }
      }
    } = transaction;

    switch (type) {
      case 'select':
        transaction.selection?.ranges.forEach(({ from, to }) => {
          this.selection$.next({
            docId: this.documentState.doc().id,
            revision: this.documentState.doc().revision,
            performedBy: localStorage.getItem('user')!,
            from: from,
            to: to
          });
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
        transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          const operand = inserted.toString();
          console.log(fromA, toA, fromB, toB, inserted);
          if (fromA !== toA) {
            const replaced = doc.sliceString(fromA, toA);
            if (operand.startsWith(replaced)) {
              this.operation$.next({
                type: 'insert',
                position: toA,
                operand: operand.substring(replaced.length),
                length: operand.length - replaced.length
              });
            } else if (operand.endsWith(replaced)) {
              this.operation$.next({
                type: 'insert',
                position: fromA - 1,
                operand: operand.slice(0, -replaced.length),
                length: operand.length - replaced.length
              });
            } else {
              this.operation$.next({
                type: 'delete',
                position: fromA,
                operand: null,
                length: toA - fromA
              });
              this.operation$.next({
                type: 'insert',
                position: fromB,
                operand: operand,
                length: operand.length
              });
            }
          } else {
            this.operation$.next({
              type: 'insert',
              position: fromB,
              operand: operand,
              length: operand.length
            });
          }
        });
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
