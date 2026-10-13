// QA acceptance helper: run from the repository root; see docs/qa/core-loop-acceptance.md.
const fs = require("node:fs");
const evidenceDir =
  process.env.KAIPA_QA_EVIDENCE_DIR || "/tmp/kaipa-qa-evidence";
fs.mkdirSync(evidenceDir, { recursive: true });
const { spawnSync } = require("node:child_process");
const files = [
  "journey-passphrase-v2",
  "journey-invite-toggle",
  "journey-member-timeline-read",
  "journey-save-timeline-item",
  "journey-reorder-timeline-items",
  "journey-rename-timeline-group",
  "journey-remove-timeline-group",
  "timeline-group-notes",
  "route-guide-import",
];
const fixtures = `
DO $$ BEGIN
 IF EXISTS(select 1 from auth.users where id <= '00000000-0000-0000-0000-000000000002'::uuid) THEN RAISE EXCEPTION 'QA fixture IDs occupied; refusing to touch existing users'; END IF;
 IF EXISTS(select 1 from journeys where id in ('invite-test','v2-test-journey')) THEN RAISE EXCEPTION 'QA fixture journey IDs occupied'; END IF;
END $$;
INSERT INTO auth.users(id,email,role,aud,is_anonymous) VALUES
('00000000-0000-0000-0000-000000000001','core-qa-owner@example.test','authenticated','authenticated',false),
('00000000-0000-0000-0000-000000000002','core-qa-other@example.test','authenticated','authenticated',false);
INSERT INTO profiles(id,display_name) VALUES
('00000000-0000-0000-0000-000000000001','QA Owner'),('00000000-0000-0000-0000-000000000002','QA Other') ON CONFLICT(id) DO NOTHING;
`;
let failed = 0;
for (const name of files) {
  let sql = fs.readFileSync("supabase/tests/" + name + ".sql", "utf8");
  if (/^begin;$/im.test(sql))
    sql = sql.replace(/^begin;$/im, () => "begin;\n" + fixtures);
  else sql = "begin;\n" + fixtures + sql + "\nrollback;";
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "kaipa-supabase-db",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  fs.writeFileSync(
    evidenceDir + "/db-" + name + ".log",
    (result.stdout || "") + (result.stderr || ""),
  );
  console.log(
    name +
      ": exit " +
      result.status +
      (result.status
        ? " " + (result.stderr || "").trim().split("\n").slice(-4).join(" | ")
        : " (ROLLBACK)"),
  );
  if (result.status) failed++;
}
process.exitCode = failed ? 1 : 0;
