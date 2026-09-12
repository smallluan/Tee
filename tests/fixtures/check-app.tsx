import { setup, computed } from "tee-framework";

const CountChip = setup(function CountChip(self) {
  return <span class="chip">{self.value}</span>;
});

export default setup(function App(self) {
  self.title = "新的 Tee 应用";
  self.guest = "";
  self.count = 0;
  self.doubled = computed(() => Number(self.count) * 2);
  return (
    <main class="page">
      <h1>{self.title}</h1>
      <p>你好，{self.guest || "访客"}</p>
      <button t-on:click={() => (self.count = Number(self.count) + 1)}>count {self.count}</button>
      <CountChip value={self.doubled} />
      <p t-if={self.count === 0}>还没点过。</p>
    </main>
  );
});
