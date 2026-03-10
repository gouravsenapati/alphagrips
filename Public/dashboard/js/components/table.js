export function createTable({columns, data}){

const table = document.createElement("table");

const thead = document.createElement("thead");

const headRow = document.createElement("tr");

columns.forEach(col => {

const th = document.createElement("th");
th.textContent = col.label;
headRow.appendChild(th);

});

thead.appendChild(headRow);

const tbody = document.createElement("tbody");

data.forEach(row => {

const tr = document.createElement("tr");

columns.forEach(col => {

const td = document.createElement("td");

td.textContent = row[col.field] ?? "-";

tr.appendChild(td);

});

tbody.appendChild(tr);

});

table.appendChild(thead);
table.appendChild(tbody);

return table;

}