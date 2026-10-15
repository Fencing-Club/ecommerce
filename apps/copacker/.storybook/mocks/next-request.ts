export function withRequest<Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result>) {
  return handler
}
