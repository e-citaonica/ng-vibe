class Node<T> {
  data: T;
  next: Node<T> | null;
  prev: Node<T> | null;

  constructor(
    data: T,
    prev: Node<T> | null = null,
    next: Node<T> | null = null
  ) {
    this.data = data;
    this.next = next;
    this.prev = prev;
  }
}

export class Queue<T> {
  private front: Node<T> | null;
  private rear: Node<T> | null;

  constructor() {
    this.front = null;
    this.rear = null;
  }

  enqueue(data: T): void {
    const newNode = new Node(data);

    if (this.isEmpty()) {
      this.front = newNode;
      this.rear = newNode;
    } else {
      if (this.rear) {
        newNode.prev = this.rear;
        this.rear.next = newNode;
        this.rear = newNode;
      }
    }
  }

  flatMap(callbackfn: (value: T) => T[] | T) {
    if (this.isEmpty()) return;

    let current = this.front;
    while (current !== null) {
      const mapped: T[] | T = callbackfn(current.data);

      const [newData, ...rest] = Array.isArray(mapped) ? mapped : [mapped];
      current.data = newData;

      for (const val of rest) {
        const node: Node<T> = new Node(val, current, current.next);
        current.next = node;
        current = current.next;
      }

      this.rear = current;
      current = current.next;
    }
  }

  dequeue(): T {
    if (this.isEmpty()) {
      throw new Error('Queue is empty');
    }

    const removedData = this.front!.data;
    this.front = this.front!.next;

    if (this.front) {
      this.front.prev = null;
    } else {
      this.rear = null;
    }

    return removedData;
  }

  peek(): T {
    if (this.isEmpty()) {
      throw new Error('Queue is empty');
    }
    return this.front!.data;
  }

  peekLast(): T {
    if (this.rear === null) {
      throw new Error('Queue is empty');
    }
    return this.rear.data;
  }

  updateLast(data: T) {
    if (this.rear !== null) {
      this.rear.data = data;
    }
  }

  isEmpty(): boolean {
    return this.front === null;
  }

  isNotEmpty(): boolean {
    return this.front !== null;
  }

  print(): void {
    let current = this.front;
    const elements: T[] = [];

    while (current !== null) {
      elements.push(current.data);
      current = current.next;
    }

    console.log('Queue:', elements);
  }

  [Symbol.iterator](): Iterator<T> {
    let current = this.front;

    return {
      next: (): IteratorResult<T> => {
        if (current !== null) {
          const value = current.data;
          current = current.next;
          return { value, done: false };
        } else {
          return { value: null as any, done: true };
        }
      },
    };
  }
}
