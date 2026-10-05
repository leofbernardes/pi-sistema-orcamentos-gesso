// Os indicadores são estáticos por enquanto. Este código apenas abre os detalhes.
const detailsDialog = document.querySelector("#details-dialog");
const detailsContent = document.querySelector("#details-content");

if (detailsDialog && detailsContent) {
  const labels = ["Cliente", "Serviço", "Valor", "Status", "Data"];

  document.querySelectorAll(".details-button").forEach((button) => {
    button.addEventListener("click", () => {
      const cells = button.closest("tr").querySelectorAll("td");
      detailsContent.replaceChildren();

      // Reutiliza os dados da linha, sem banco de dados ou armazenamento.
      labels.forEach((label, index) => {
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = cells[index].textContent.trim();
        detailsContent.append(term, description);
      });

      detailsDialog.showModal();
    });
  });
}
