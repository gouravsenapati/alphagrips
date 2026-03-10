export function renderTable(containerId, columns, data) {

  const container = document.getElementById(containerId);

  const headers = columns.map(c => `<th>${c.label}</th>`).join("");

  const rows = data.map(row => {

    const cells = columns.map(c => {

      if (typeof c.render === "function") {
        return `<td>${c.render(row)}</td>`;
      }

      return `<td>${row[c.key] ?? ""}</td>`;

    }).join("");

    return `<tr>${cells}</tr>`;

  }).join("");

  container.innerHTML = `
    <table border="1" width="100%">
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}export function renderTable(containerId, columns, data) {

  const container = document.getElementById(containerId);

  const headers = columns.map(c => `<th>${c.label}</th>`).join("");

  const rows = data.map(row => {

    const cells = columns.map(c => {

      if (typeof c.render === "function") {
        return `<td>${c.render(row)}</td>`;
      }

      return `<td>${row[c.key] ?? ""}</td>`;

    }).join("");

    return `<tr>${cells}</tr>`;

  }).join("");

  container.innerHTML = `
    <table border="1" width="100%">
      <thead>
        <tr>${headers}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}