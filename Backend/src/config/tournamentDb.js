import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

const tournamentDb = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_KEY,
  {
    db: {
      schema: "ag_tournament"
    }
  }
);

export default tournamentDb;
