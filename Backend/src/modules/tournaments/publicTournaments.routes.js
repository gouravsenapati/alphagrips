import express from "express";
import {
  createPublicRegistrationPaymentOrderHandler,
  createPublicTournamentRegistrationHandler,
  listPublicTournamentsHandler,
  getPublicTournamentOverviewHandler,
  listPublicMatchesHandler,
  listPublicRegistrationOptionsHandler,
  verifyPublicRegistrationPaymentHandler
} from "./controllers/tournaments.controller.js";

const router = express.Router();

router.get("/", listPublicTournamentsHandler);
router.get("/:lookup/overview", getPublicTournamentOverviewHandler);
router.get("/:lookup/matches", listPublicMatchesHandler);
router.get("/:lookup/registration-options", listPublicRegistrationOptionsHandler);
router.post("/:lookup/registrations", createPublicTournamentRegistrationHandler);
router.post(
  "/:lookup/registrations/:registrationId/create-payment-order",
  createPublicRegistrationPaymentOrderHandler
);
router.post(
  "/:lookup/registrations/:registrationId/verify-payment",
  verifyPublicRegistrationPaymentHandler
);

export default router;
