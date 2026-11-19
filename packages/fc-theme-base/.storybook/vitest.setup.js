// Story tests see every disclosure and popup as it ends up: animations and transitions finish at once, so no play
// function checks one halfway through. Only test runs load this file; Storybook keeps the motion.
const still = document.createElement('style');
still.textContent = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;
document.head.append(still);
