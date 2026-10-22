import { httpResponse } from "../src/server/http-response"

// A route handler as Start serves it: through the HTTP boundary, which answers its failures and sets its cache policy.
// A handler that takes no request is served one for the root path.
export const served =
  <A extends unknown[]>(route: (...args: A) => Response | Promise<Response>) =>
  (...args: A) =>
    httpResponse(args[0] instanceof Request ? args[0] : new Request("http://localhost/"), () => route(...args))
