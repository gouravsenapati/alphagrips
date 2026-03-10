export function showModal(content) {

  const modal = document.createElement("div");
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box">
        <button class="modal-close">×</button>
        ${content}
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".modal-close").onclick = () => modal.remove();
  modal.querySelector(".modal-backdrop").onclick = () => modal.remove();
}