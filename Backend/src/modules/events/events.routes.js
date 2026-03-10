import express from "express";
import { auth } from "../../middleware/auth.middleware.js";
import { registerParticipantByEventIdHandler } from "../tournaments/controllers/tournaments.controller.js";

const router = express.Router();

router.post("/:eventId/register-participant", auth, registerParticipantByEventIdHandler);

export default router;
