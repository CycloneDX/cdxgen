const overrideResolves = (resolved, opts) => {
  const { omitLockfileRegistryResolved = false } = opts;

  if (omitLockfileRegistryResolved) {
    return undefined;
  }

  return resolved;
};

export { overrideResolves };
