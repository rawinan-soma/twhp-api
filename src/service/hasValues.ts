export const hasValues = (values: object): boolean =>
  Object.values(values).some((value) => value !== undefined);
