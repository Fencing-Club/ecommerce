import { fn } from "storybook/test"

export const finishSignIn = fn<(href: string) => void>().mockName("finishSignIn")
