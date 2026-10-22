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
