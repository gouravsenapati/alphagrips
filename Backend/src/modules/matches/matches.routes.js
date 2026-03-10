import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";
import { runTournamentScheduler } from "../../services/tournamentScheduler.service.js";
import {
  assignCourtHandler,
  completeMatchHandler,
  getMatchSetsHandler,
  startMatchHandler,
  updateMatchSetsHandler
} from "../tournaments/controllers/tournaments.controller.js";

const router = express.Router();

router.get("/",auth,async(req,res)=>{

let query=supabase
.from("matches_input")
.select(`
id,
match_date,
score_raw,
academy_id,
player1:player1_id(id,name),
player2:player2_id(id,name)
`)
.order("match_date",{ascending:false});

query=applyAcademyFilter(query,req);

const {data,error}=await query;

if(error)
return res.status(500).json({error:error.message});

res.json(data);

});

router.post("/scheduler/run", auth, async (req, res) => {

const {
  tournament_id,
  event_id = null,
  max_assignments = null,
  dry_run = false
} = req.body;

try {

const result = await runTournamentScheduler({
  tournamentId: tournament_id,
  eventId: event_id,
  maxAssignments: max_assignments,
  dryRun: dry_run
});

res.json(result);

} catch (error) {

const statusCode = error.statusCode || 500;

res.status(statusCode).json({
  error: error.message || "Scheduler run failed"
});

}

});

router.post("/:matchId/assign-court", auth, assignCourtHandler);
router.post("/:matchId/start", auth, startMatchHandler);
router.get("/:matchId/sets", auth, getMatchSetsHandler);
router.put("/:matchId/sets", auth, updateMatchSetsHandler);
router.post("/:matchId/complete", auth, completeMatchHandler);

export default router;
