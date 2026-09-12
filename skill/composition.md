# Composition

Reusable logic is a **normal function** that writes onto the same `self`. It is not a React Hook.

```ts
function useCounter(self) {
  self.n = 0;
  self.bump = () => {
    self.n = Number(self.n) + 1;
  };
}

export default setup(function App(self) {
  useCounter(self);
  self.label = computed(() => `n=${self.n}`);
  return <button t-on:click={self.bump}>{self.label}</button>;
});
```

Call `useXxx(self)` **during setup**, not later in an event (unless you only assign methods).

`router(self, { routes })` is the same shape: a function that writes `$route` / `$router` onto `self`. See [router.md](router.md).

`computed` / `watch` / `onMounted` inside `useXxx` are fine because setup is still on the stack.

## Do not

- Name it `useState` or expect hook rules (call order across re-renders — there are no re-renders).
- Return a new `self`. There is one object.
- Import Vue composables or React hooks.
