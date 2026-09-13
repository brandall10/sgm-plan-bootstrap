const result = document.querySelector("#mock-result");
const restore = document.querySelector("#restore");
const startOver = document.querySelector("#start-over");

restore?.addEventListener("click", () => {
  if (result) result.textContent = "Mock outcome: restore would return 8 completed exercises.";
});

startOver?.addEventListener("click", () => {
  if (result) result.textContent = "Mock outcome: start over would discard the snapshot and fence queued saves.";
});
