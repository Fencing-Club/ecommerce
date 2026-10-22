import { httpResponse } from "../src/server/http-response"

// A route handler as Start serves it: through the HTTP boundary, which answers its failures and sets its cache policy.
export const served =
  <A extends unknown[]>(route: (...args: A) => Response | Promise<Response>) =>
  (...args: A) =>
    httpResponse(() => route(...args))
