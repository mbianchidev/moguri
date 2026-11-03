for (const type of ["dragenter", "dragover", "drop"]) window.addEventListener(type, (event) => {
  event.preventDefault(); event.stopImmediatePropagation();
}, true);
window.addEventListener("paste", (event) => {
  event.preventDefault(); event.stopImmediatePropagation();
}, true);
