import { getPlayers } from "../../services/players.service.js";
import { renderTable } from "../../core/table.js";

export async function init() {

  const players = await getPlayers();

  const columns = [

    { key: "name", label: "Name" },

    {
      label: "Category",
      render: r => r.category?.name || ""
    },

    {
      label: "Status",
      key: "status"
    }

  ];

  renderTable("moduleContent", columns, players);

}