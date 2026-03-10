import express from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import academiesRoutes from "../modules/academies/academies.routes.js";
import playersRoutes from "../modules/players/players.routes.js";
import categoriesRoutes from "../modules/categories/categories.routes.js";
import eventsRoutes from "../modules/events/events.routes.js";
import matchesRoutes from "../modules/matches/matches.routes.js";
import rankingsRoutes from "../modules/rankings/rankings.routes.js";
import financeRoutes from "../modules/finance/finance.routes.js";
import batchesRoutes from "../modules/batches/batches.routes.js";
import batchSessionsRoutes from "../modules/batchSessions/batchSessions.routes.js";
import playerBatchesRoutes from "../modules/playerBatches/playerBatches.routes.js";
import usersRoutes from "../modules/users/users.routes.js";
import tournamentsRoutes from "../modules/tournaments/tournaments.routes.js";
import publicTournamentsRoutes from "../modules/tournaments/publicTournaments.routes.js";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import fitnessRoutes from "../modules/fitness/fitness.routes.js";
import academyMatchesRoutes from "../modules/academyMatches/academyMatches.routes.js";
import publicRoutes from "../modules/public/public.routes.js";
import categoryFeePlansRoutes from "../modules/categoryFeePlans/categoryFeePlans.routes.js";
import invoicesRoutes from "../modules/invoices/invoices.routes.js";
import invoicePaymentsRoutes from "../modules/invoicePayments/invoicePayments.routes.js";
import receiptsRoutes from "../modules/receipts/receipts.routes.js";
import parentPortalRoutes from "../modules/parentPortal/parentPortal.routes.js";

const router = express.Router();

router.use("/auth",authRoutes);
router.use("/academies",academiesRoutes);
router.use("/players",playersRoutes);
router.use("/users", usersRoutes);
router.use("/categories",categoriesRoutes);
router.use("/events",eventsRoutes);
router.use("/matches",matchesRoutes);
router.use("/rankings",rankingsRoutes);
router.use("/finance",financeRoutes);
router.use("/batches", batchesRoutes);
router.use("/batch-sessions", batchSessionsRoutes);
router.use("/player-batches", playerBatchesRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/fitness", fitnessRoutes);
router.use("/academy-matches", academyMatchesRoutes);
router.use("/category-fee-plans", categoryFeePlansRoutes);
router.use("/invoices", invoicesRoutes);
router.use("/invoice-payments", invoicePaymentsRoutes);
router.use("/receipts", receiptsRoutes);
router.use("/parent", parentPortalRoutes);
router.use("/tournaments", tournamentsRoutes);
router.use("/public/tournaments", publicTournamentsRoutes);
router.use("/public", publicRoutes);


export default router;
