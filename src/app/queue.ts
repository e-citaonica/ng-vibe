export class Queue<T> {
  private readonly queue: T[];
  private start: number;
  private end: number;

  constructor(array: T[] = []) {
    this.queue = array;

    // pointers
    this.start = 0;
    this.end = array.length;
  }

  isEmpty() {
    return this.end === this.start;
  }

  dequeue() {
    if (this.isEmpty()) {
      throw new Error('Queue is empty.');
    } else {
      return this.queue[this.start++];
    }
  }

  enqueue(value: T) {
    this.queue.push(value);
    this.end += 1;
  }

  toString() {
    return `Queue (${this.end - this.start})`;
  }

  [Symbol.iterator]() {
    let index = this.start;
    return {
      next: () =>
        index < this.end
          ? {
              value: this.queue[index++],
            }
          : { value: undefined as T, done: true },
    };
  }
}
