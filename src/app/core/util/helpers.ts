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
