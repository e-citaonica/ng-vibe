const h = (str: string): number => {
  return [...str].reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
};

export const hashStringToColor = (str: string) => {
  const stringUniqueHash = h(str);

  const color = `hsl(${Math.abs(stringUniqueHash % 360)}, 85%, 85%)`;

  return color;
};

export const findFirstWholeWordFromLeft = (
  input: string,
  right: number
): string => {
  if (right < 0 || right >= input.length) {
    throw new Error('Index for string out of bounds');
  }

  let left = right;

  while (left >= 0 && !/^[A-Z]$/i.test(input[left])) {
    left--;
  }

  right = left + 1;

  while (left >= 0 && /^[A-Z]$/i.test(input[left])) {
    left--;
  }

  return input.substring(left + 1, right);
};
