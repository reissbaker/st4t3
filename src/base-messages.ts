export type BaseMessages = {
  // We often use Partial message types, which force allowing undefined. Unfortunately I don't know
  // if it's possible to make a variant of the Partial type that allows a subset of keys, but forces
  // them all to be defined
  [key: string]: undefined | ((...args: any) => any),
};
