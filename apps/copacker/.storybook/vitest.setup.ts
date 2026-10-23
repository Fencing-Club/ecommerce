// Story tests see every popup, menu and dialog as it ends up: animations and transitions finish at once, so no play
// function checks one halfway through fading in or out. Only test runs load this file; Storybook keeps the motion for
// people looking at the stories.
const still = document.createElement("style")
still.textContent = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`
document.head.append(still)

// Each story file mocks its requests in its own frame. Vitest runs several files at once, and MSW's one service worker
// for all of them loses track of which frame asked: a story would get another file's answer, or none. Without the
// Service Worker API, MSW intercepts the frame's own fetch and XMLHttpRequest calls instead.
Reflect.deleteProperty(Navigator.prototype, "serviceWorker")
