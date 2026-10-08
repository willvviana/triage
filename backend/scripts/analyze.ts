// scripts/analyze.ts
// The reason Triage exists: identify which customers are accumulating
// error-level logs. This is the seed of the product; everything else
// (API, dashboard) is delivery.
//
// Decisions locked in (from design review):
//   1. Definition of "top failing": count of error-level logs per customer.
//      No priority weighting, no ratio. Simple, defensible, correct for v0.1.
//   2. Time window: hardcoded 7 days. Becomes a query param at the API layer.
//   3. Zero-error customers: INCLUDED. Zero is information.
//      Requires LEFT JOIN + COUNT(tl.id), not COUNT(*).
//
// Run with: npm run analyze

import 'dotenv/config';
import { pool } from '../src/db/client.js';

interface Row {
  customer_id: string;
  customer_name: string;
  plan: string;
  error_count: string; // pg returns COUNT(*) as string (bigint). Cast at display.
}

async function analyze(): Promise<void> {
  const client = await pool.connect();

  try {
    // -----------------------------------------------------------------------
    // The query.
    //
    // Read it bottom-up:
    //   FROM customers
    //     -> every customer is the starting point. Not optional.
    //   LEFT JOIN tickets
    //     -> a customer with no tickets still appears.
    //   LEFT JOIN ticket_logs
    //     -> with the error + time filters in the ON clause, NOT the WHERE.
    //        If the filters were in WHERE, the LEFT JOIN would degenerate
    //        into an INNER JOIN and zero-error customers would vanish.
    //   COUNT(tl.id)
    //     -> counts non-null log ids. A customer with no matching logs
    //        has tl.id = NULL for every row, so COUNT returns 0.
    //        COUNT(*) would return 1 in that case. This is the trap.
    //   GROUP BY c.id, c.name, c.plan
    //     -> one row per customer.
    //   ORDER BY error_count DESC
    //     -> worst offenders first.
    // -----------------------------------------------------------------------
    const result = await client.query<Row>(`
      SELECT
        c.id            AS customer_id,
        c.name          AS customer_name,
        c.plan          AS plan,
        COUNT(tl.id)    AS error_count
      FROM customers c
      LEFT JOIN tickets t
        ON t.customer_id = c.id
      LEFT JOIN ticket_logs tl
        ON tl.ticket_id = t.id
       AND tl.level = 'error'
       AND tl.occurred_at >= NOW() - INTERVAL '7 days'
      GROUP BY c.id, c.name, c.plan
      ORDER BY error_count DESC, c.name ASC
    `);

    // -----------------------------------------------------------------------
    // Display. The query does the work; this just formats it.
    // We pad the customer name so columns line up, and parse error_count
    // to a number because pg returns bigint as a string.
    // -----------------------------------------------------------------------
    console.log('\nTop failing customers — error logs in last 7 days\n');
    console.log(
      '  ' +
        'Customer'.padEnd(24) +
        'Plan'.padEnd(12) +
        'Errors',
    );
    console.log('  ' + '-'.repeat(46));

    for (const row of result.rows) {
      const name = row.customer_name.padEnd(24);
      const plan = row.plan.padEnd(12);
      const count = Number(row.error_count);
      console.log(`  ${name}${plan}${count}`);
    }

    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

analyze().catch((err) => {
  console.error('[analyze] failed:', err);
  process.exit(1);
});