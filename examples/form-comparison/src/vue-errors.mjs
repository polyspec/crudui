// The error rule of the canonical page's Vue application: an error a component or its render
// function raises fails the page as a script error instead of a console line, like every other
// view's failure. Vue's own hydration-mismatch warnings stay development-only; the frame and
// parity checks of the verification contract detect a mismatched takeover.

/**
 * Make `app` fail on its first error. `app` is a Vue application; only the member the rule uses
 * is part of this contract.
 * @param {{ config: { errorHandler: (error: unknown) => void } }} app
 */
export function failOnErrors(app) {
  app.config.errorHandler = error => {
    throw error;
  };
}
