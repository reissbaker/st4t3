export type BaseMessages = {
  stop?: () => any,
} & {
  [key: string]: undefined | ((...args: any) => any),
};
