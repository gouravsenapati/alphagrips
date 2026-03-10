import path from "path";
import { fileURLToPath } from "url";
import { once } from "events";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import app from "../src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(projectRoot, "Backend/.env"), override: false });

const port = Number(process.env.QA_PORT || 5058);
const baseUrl = `http://127.0.0.1:${port}`;

function log(message, data) {
  if (data === undefined) {
    console.log(message);
    return;
  }

  console.log(message, JSON.stringify(data, null, 2));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatToday(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function buildToken() {
  return jwt.sign(
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "admin",
      academy_id: "qa-academy"
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

async function api(token, method, pathName, { body, expectedStatuses = [200, 201] } = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let parsed;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!expectedStatuses.includes(response.status)) {
    const error = new Error(`${method} ${pathName} -> ${response.status} ${text}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }

  return { status: response.status, data: parsed };
}

async function runQaFlow() {
  const token = buildToken();
  const suffix = `QA-${Date.now()}`;

  log("QA start", { baseUrl, suffix });

  const tournament = (
    await api(token, "POST", "/api/tournaments", {
      body: {
        tournament_name: `ZZ QA Tournament ${suffix}`,
        tournament_code: `ZZ-${Date.now()}`,
        venue_name: "QA Arena",
        city: "Hyderabad",
        state: "Telangana",
        country: "India",
        start_date: formatToday(0),
        end_date: formatToday(1),
        status: "draft",
        notes: "Automated live QA run"
      }
    })
  ).data;

  assert(tournament?.id, "Tournament creation failed");
  log("Tournament created", { id: tournament.id, name: tournament.tournament_name });

  const tournaments = (await api(token, "GET", "/api/tournaments", {
    expectedStatuses: [200]
  })).data;
  assert(tournaments.some((item) => item.id === tournament.id), "Created tournament missing from list");

  const court1 = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/courts`, {
      body: { court_name: "Court 1", sort_order: 1 }
    })
  ).data;
  const court2 = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/courts`, {
      body: { court_name: "Court 2", sort_order: 2 }
    })
  ).data;
  log("Courts created", [court1.court_name, court2.court_name]);

  const eventB = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/events`, {
      body: {
        event_name: `Conflict Source Singles ${suffix}`,
        format: "singles",
        status: "registration_open",
        sort_order: 1
      }
    })
  ).data;

  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventB.id}/participants`, {
    body: { player1_id: `shared-player-${suffix}` }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventB.id}/participants`, {
    body: { player1_id: `source-opp-${suffix}` }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventB.id}/draw/generate`, {
    body: {},
    expectedStatuses: [200]
  });

  const eventBSchedule = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/scheduler/run`, {
      body: { event_id: eventB.id, max_assignments: 1, dry_run: false },
      expectedStatuses: [200]
    })
  ).data;
  assert(eventBSchedule.scheduled_count === 1, "Conflict source match was not scheduled");

  let eventBMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventB.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const matchB = eventBMatches.find((match) => match.status === "scheduled");
  assert(matchB, "Scheduled match for conflict source event not found");
  log("Conflict source scheduled", {
    matchId: matchB.id,
    courtId: matchB.court_id,
    status: matchB.status
  });

  const eventC = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/events`, {
      body: {
        event_name: `Conflict Target Doubles ${suffix}`,
        format: "doubles",
        status: "registration_open",
        sort_order: 2
      }
    })
  ).data;

  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventC.id}/participants`, {
    body: {
      player1_id: `shared-player-${suffix}`,
      player2_id: `partner-a-${suffix}`
    }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventC.id}/participants`, {
    body: {
      player1_id: `target-opp-1-${suffix}`,
      player2_id: `target-opp-2-${suffix}`
    }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventC.id}/draw/generate`, {
    body: {},
    expectedStatuses: [200]
  });

  const conflictRun = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/scheduler/run`, {
      body: { max_assignments: 5, dry_run: false },
      expectedStatuses: [200]
    })
  ).data;
  assert(conflictRun.scheduled_count === 0, "Conflict target should not be auto-scheduled while shared player is active");
  assert(
    (conflictRun.skipped_matches || []).some((entry) => entry.reason === "player_conflict"),
    "Expected player_conflict skip reason was not returned"
  );
  log("Conflict prevention verified", conflictRun);

  const eventD = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/events`, {
      body: {
        event_name: `Manual Court Assignment ${suffix}`,
        format: "singles",
        status: "registration_open",
        sort_order: 3
      }
    })
  ).data;

  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventD.id}/participants`, {
    body: { player1_id: `manual-p1-${suffix}` }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventD.id}/participants`, {
    body: { player1_id: `manual-p2-${suffix}` }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventD.id}/draw/generate`, {
    body: {},
    expectedStatuses: [200]
  });

  const eventDMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventD.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const matchD = eventDMatches.find((match) => match.status === "pending");
  assert(matchD, "Manual assignment match not found");

  const manualAssignment = (
    await api(token, "POST", `/api/tournaments/matches/${matchD.id}/assign-court`, {
      body: { court_id: court2.id },
      expectedStatuses: [200]
    })
  ).data;
  assert(manualAssignment.court_id === court2.id, "Manual court assignment did not use Court 2");
  log("Manual court assignment verified", { matchId: matchD.id, courtId: court2.id });

  await api(token, "POST", `/api/tournaments/matches/${matchB.id}/start`, {
    body: {},
    expectedStatuses: [200]
  });
  await api(token, "PUT", `/api/tournaments/matches/${matchB.id}/sets`, {
    body: {
      sets: [
        { set_number: 1, participant1_score: 21, participant2_score: 15 },
        { set_number: 2, participant1_score: 18, participant2_score: 21 },
        { set_number: 3, participant1_score: 21, participant2_score: 19 }
      ]
    },
    expectedStatuses: [200]
  });
  const completedB = (
    await api(token, "POST", `/api/tournaments/matches/${matchB.id}/complete`, {
      body: {},
      expectedStatuses: [200]
    })
  ).data;
  assert(completedB.match_id === matchB.id, "Conflict source completion failed");
  log("Conflict source completed", completedB);

  const refreshedMatchDList = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventD.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const refreshedMatchD = refreshedMatchDList[0];
  await api(token, "POST", `/api/tournaments/matches/${refreshedMatchD.id}/complete`, {
    body: {
      winner_id: refreshedMatchD.participant1_id,
      result_type: "walkover"
    },
    expectedStatuses: [200]
  });
  log("Manual assignment match completed by walkover", { matchId: refreshedMatchD.id });

  const postConflictSchedule = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/scheduler/run`, {
      body: { max_assignments: 5, dry_run: false },
      expectedStatuses: [200]
    })
  ).data;
  assert(postConflictSchedule.scheduled_count >= 1, "Conflict target was not scheduled after source match completion");

  const eventCMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventC.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const matchC = eventCMatches.find((match) => match.status === "scheduled");
  assert(matchC, "Conflict target scheduled match not found after retry");

  await api(token, "POST", `/api/tournaments/matches/${matchC.id}/complete`, {
    body: {
      winner_id: matchC.participant1_id,
      result_type: "walkover"
    },
    expectedStatuses: [200]
  });
  log("Conflict target completed by walkover", { matchId: matchC.id });

  const eventA = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/events`, {
      body: {
        event_name: `Bye Propagation Singles ${suffix}`,
        format: "singles",
        status: "registration_open",
        sort_order: 4
      }
    })
  ).data;

  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventA.id}/participants`, {
    body: { player1_id: `bye-p1-${suffix}` }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventA.id}/participants`, {
    body: { player1_id: `bye-p2-${suffix}` }
  });
  await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventA.id}/participants`, {
    body: { player1_id: `bye-p3-${suffix}` }
  });

  const duplicateRegistration = await api(
    token,
    "POST",
    `/api/tournaments/${tournament.id}/events/${eventA.id}/participants`,
    {
      body: { player1_id: `bye-p1-${suffix}` },
      expectedStatuses: [409]
    }
  );
  assert(duplicateRegistration.status === 409, "Duplicate registration should return 409");
  log("Duplicate participant prevention verified", duplicateRegistration.data);

  const drawA = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/events/${eventA.id}/draw/generate`, {
      body: {},
      expectedStatuses: [200]
    })
  ).data;
  log("Bye event draw generated", drawA);

  const byesA = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/byes/process`, {
      body: { event_id: eventA.id },
      expectedStatuses: [200]
    })
  ).data;
  log("Bye processing response", byesA);

  let eventAMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventA.id}`, {
      expectedStatuses: [200]
    })
  ).data;

  const byeCompletedMatch = eventAMatches.find(
    (match) => match.result_type === "bye" && match.status === "completed"
  );
  assert(byeCompletedMatch, "Expected a bye-completed match in the bye event");

  const eventASemi = eventAMatches.find(
    (match) =>
      match.round_number === 1 &&
      match.status === "pending" &&
      match.participant1_id &&
      match.participant2_id
  );
  assert(eventASemi, "Pending playable semifinal was not found in bye event");

  const prePropagationFinal = eventAMatches.find((match) => match.round_number === 2);
  assert(prePropagationFinal, "Final match missing in bye event");
  assert(
    [prePropagationFinal.participant1_id, prePropagationFinal.participant2_id].some(Boolean),
    "Final should already contain the bye winner before semifinal completion"
  );
  log("Bye resolution verified", {
    byeMatchId: byeCompletedMatch.id,
    semifinalId: eventASemi.id,
    finalId: prePropagationFinal.id
  });

  const scheduleA1 = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/scheduler/run`, {
      body: { event_id: eventA.id, max_assignments: 1, dry_run: false },
      expectedStatuses: [200]
    })
  ).data;
  assert(scheduleA1.scheduled_count === 1, "Bye event semifinal was not scheduled");

  eventAMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventA.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const scheduledSemi = eventAMatches.find(
    (match) => match.id === eventASemi.id && match.status === "scheduled"
  );
  assert(scheduledSemi, "Bye event semifinal was not scheduled correctly");

  await api(token, "POST", `/api/tournaments/matches/${scheduledSemi.id}/start`, {
    body: {},
    expectedStatuses: [200]
  });
  await api(token, "PUT", `/api/tournaments/matches/${scheduledSemi.id}/sets`, {
    body: {
      sets: [
        { set_number: 1, participant1_score: 21, participant2_score: 11 },
        { set_number: 2, participant1_score: 21, participant2_score: 17 }
      ]
    },
    expectedStatuses: [200]
  });
  await api(token, "POST", `/api/tournaments/matches/${scheduledSemi.id}/complete`, {
    body: {},
    expectedStatuses: [200]
  });

  eventAMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventA.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const propagatedFinal = eventAMatches.find((match) => match.round_number === 2);
  assert(
    propagatedFinal.participant1_id && propagatedFinal.participant2_id,
    "Winner propagation did not populate both final slots"
  );
  log("Winner propagation verified", {
    finalId: propagatedFinal.id,
    participant1_id: propagatedFinal.participant1_id,
    participant2_id: propagatedFinal.participant2_id
  });

  const scheduleA2 = (
    await api(token, "POST", `/api/tournaments/${tournament.id}/scheduler/run`, {
      body: { event_id: eventA.id, max_assignments: 1, dry_run: false },
      expectedStatuses: [200]
    })
  ).data;
  assert(scheduleA2.scheduled_count === 1, "Bye event final was not scheduled");

  eventAMatches = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/matches?event_id=${eventA.id}`, {
      expectedStatuses: [200]
    })
  ).data;
  const scheduledFinal = eventAMatches.find(
    (match) => match.id === propagatedFinal.id && match.status === "scheduled"
  );
  assert(scheduledFinal, "Bye event final was not scheduled correctly");

  await api(token, "POST", `/api/tournaments/matches/${scheduledFinal.id}/start`, {
    body: {},
    expectedStatuses: [200]
  });
  await api(token, "PUT", `/api/tournaments/matches/${scheduledFinal.id}/sets`, {
    body: {
      sets: [
        { set_number: 1, participant1_score: 21, participant2_score: 14 },
        { set_number: 2, participant1_score: 21, participant2_score: 19 }
      ]
    },
    expectedStatuses: [200]
  });
  await api(token, "POST", `/api/tournaments/matches/${scheduledFinal.id}/complete`, {
    body: {},
    expectedStatuses: [200]
  });

  const finalOverview = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/overview`, {
      expectedStatuses: [200]
    })
  ).data;
  const finalCourts = (
    await api(token, "GET", `/api/tournaments/${tournament.id}/courts`, {
      expectedStatuses: [200]
    })
  ).data;

  assert(finalCourts.every((court) => court.status === "available"), "Not all courts were released at the end of QA");

  log("QA completed successfully", {
    tournamentId: tournament.id,
    tournamentName: tournament.tournament_name,
    eventCount: finalOverview.events.length,
    courtStatuses: finalCourts.map((court) => ({
      court_name: court.court_name,
      status: court.status
    })),
    eventSummaries: finalOverview.events.map((event) => ({
      event_name: event.event_name,
      participant_count: event.participant_count,
      match_summary: event.match_summary
    }))
  });
}

async function main() {
  const server = app.listen(port, "127.0.0.1");

  try {
    await once(server, "listening");
    await runQaFlow();
  } catch (error) {
    if (
      typeof error.message === "string" &&
      error.message.includes("Invalid schema: ag_tournament")
    ) {
      console.error("QA FAILED");
      console.error(
        "Supabase API does not currently expose the ag_tournament schema. Expose ag_tournament in Supabase API settings, then rerun this script."
      );
    } else {
      console.error("QA FAILED");
      console.error(error);
    }

    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
