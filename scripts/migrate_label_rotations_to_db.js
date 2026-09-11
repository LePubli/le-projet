/**
 * TriMaint — one-shot migration: push localStorage label rotations to DB
 *
 * Background
 *   Prior to v1.3.3, label rotations were stored in browser localStorage under
 *   the key `trimaint_label_rotations` (a `{ [machineId]: deg }` map) and
 *   NEVER sent to the backend. As of v1.3.3, rotations are persisted in the
 *   `machines.rotation` column and shared across all clients.
 *
 * Usage (one-shot, per browser that previously set rotations)
 *   1. Log in to TriMaint as a manager/admin.
 *   2. Open the browser DevTools → Console.
 *   3. Paste this entire script and press Enter.
 *   4. Wait for "✓ Migration terminée" — rotations are now server-side.
 *   5. Optional cleanup: `localStorage.removeItem('trimaint_label_rotations')`
 *
 * Safety
 *   - Only sends PUT /api/machines/{id} for IDs actually present in the local
 *     rotation map. Skips entries with rotation === 0.
 *   - Idempotent: re-running it has no effect once localStorage is cleared.
 */
(async function migrateRotations() {
  const KEY = 'trimaint_label_rotations'
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    console.info('[TriMaint] Aucune rotation dans localStorage — rien à migrer.')
    return
  }
  let map
  try {
    map = JSON.parse(raw)
  } catch (e) {
    console.error('[TriMaint] localStorage corrompu:', e)
    return
  }
  const entries = Object.entries(map)
    .map(([id, deg]) => [parseInt(id, 10), Number(deg)])
    .filter(([id, deg]) => Number.isInteger(id) && id > 0 && Number.isFinite(deg) && deg !== 0)
  if (entries.length === 0) {
    console.info('[TriMaint] Aucune rotation non-nulle à migrer.')
    return
  }
  console.info(`[TriMaint] Migration de ${entries.length} rotation(s) vers la DB...`)
  let ok = 0, fail = 0
  for (const [id, deg] of entries) {
    try {
      await api.put(`/machines/${id}`, { rotation: deg })
      console.info(`  ✓ machine ${id} → ${deg}°`)
      ok++
    } catch (err) {
      console.warn(`  ✗ machine ${id} — échec`, err?.response?.data || err)
      fail++
    }
  }
  console.info(`[TriMaint] ✓ Migration terminée — ${ok} réussie(s), ${fail} échec(s).`)
  console.info('[TriMaint] Vous pouvez maintenant supprimer la clé localStorage :')
  console.info("  localStorage.removeItem('trimaint_label_rotations')")
})()
