import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const criticiteLabel: Record<number, string> = {
  1: 'Très faible', 2: 'Faible', 3: 'Moyen', 4: 'Élevé', 5: 'Critique',
}
const criticiteColor: Record<number, string> = {
  1: '#3b82f6', 2: '#22c55e', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
}

function fmt(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtFull(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function RapportPanne() {
  const { id } = useParams()
  const [panne, setPanne] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get(`/pannes/${id}/detail`)
      .then(r => setPanne(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (panne) {
      document.title = `Rapport — ${panne.titre}`
      setTimeout(() => window.print(), 800)
    }
  }, [panne])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#6b7280' }}>
      Chargement du rapport...
    </div>
  )
  if (error || !panne) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#ef4444' }}>
      Erreur : impossible de charger les données de la panne.
    </div>
  )

  const crit = panne.criticite ?? 3
  const critColor = criticiteColor[crit] || '#6b7280'
  const critLabel = criticiteLabel[crit] || `Niveau ${crit}`

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; }
        .page { max-width: 210mm; margin: 0 auto; padding: 12mm 14mm; }
        .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; border-bottom: 3px solid #f97316; margin-bottom: 18px; }
        .logo-block { display: flex; align-items: center; gap: 10px; }
        .logo-box { width: 40px; height: 40px; background: #f97316; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
        .app-name { font-size: 22px; font-weight: 800; color: #111; }
        .app-sub { font-size: 11px; color: #6b7280; }
        .report-meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.6; }
        .doc-title { font-size: 17px; font-weight: 700; color: #f97316; margin-bottom: 2px; }

        .panne-header { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
        .panne-title { font-size: 18px; font-weight: 800; color: #111; margin-bottom: 6px; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; color: white; margin-left: 8px; vertical-align: middle; }
        .panne-desc { font-size: 12px; color: #4b5563; margin-top: 6px; }
        .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
        .meta-cell label { display: block; font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
        .meta-cell span { font-size: 12px; font-weight: 600; color: #111; }
        .meta-cell span.accent { color: #f97316; }

        .section { margin-bottom: 18px; break-inside: avoid; }
        .section-title { font-size: 13px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 5px; border-bottom: 1.5px solid #e5e7eb; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .section-title::before { content: ''; display: inline-block; width: 3px; height: 14px; background: #f97316; border-radius: 2px; }

        .protocole-box { background: #fffbf5; border: 1px solid #fed7aa; border-radius: 6px; padding: 12px 14px; font-size: 12px; line-height: 1.8; color: #374151; white-space: pre-wrap; font-family: 'Segoe UI', sans-serif; }
        .empty-box { font-size: 12px; color: #9ca3af; font-style: italic; }

        .diag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .diag-cell { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
        .diag-cell label { display: block; font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .diag-cell p { font-size: 12px; color: #374151; line-height: 1.6; }
        .causes-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .cause-tag { background: #e5e7eb; color: #374151; font-size: 11px; padding: 2px 8px; border-radius: 4px; }

        .interventions-list { display: flex; flex-direction: column; gap: 8px; }
        .inter-row { display: flex; gap: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
        .inter-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; margin-top: 1px; }
        .inter-dot.ok { background: #dcfce7; color: #16a34a; }
        .inter-dot.pending { background: #fef9c3; color: #ca8a04; }
        .inter-content { flex: 1; }
        .inter-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; }
        .inter-tech { font-size: 13px; font-weight: 600; color: #111; }
        .inter-badges { display: flex; gap: 6px; align-items: center; }
        .inter-badge { font-size: 10px; padding: 1px 7px; border-radius: 10px; }
        .inter-badge.valid { background: #dcfce7; color: #15803d; }
        .inter-badge.pending { background: #fef9c3; color: #92400e; }
        .inter-duration { font-size: 11px; color: #6b7280; }
        .inter-comment { font-size: 12px; color: #4b5563; margin-top: 3px; line-height: 1.5; }
        .inter-date { font-size: 10px; color: #9ca3af; margin-top: 4px; }

        .pieces-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .pieces-table th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; padding: 7px 10px; text-align: left; border-bottom: 1px solid #d1d5db; }
        .pieces-table td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
        .pieces-table tr:last-child td { border-bottom: none; }
        .pieces-table .mono { font-family: 'Courier New', monospace; font-size: 11px; color: #6b7280; }

        .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #9ca3af; }

        .no-print { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 100; }
        .btn-print { background: #f97316; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-close { background: #374151; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; }

        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 8mm 10mm; }
          .protocole-box { background: #fffbf5 !important; border-color: #fed7aa !important; }
          .panne-header { background: #f9fafb !important; }
          .diag-cell { background: #f9fafb !important; }
          .inter-row { background: #f9fafb !important; }
          .pieces-table th { background: #f3f4f6 !important; }
          .inter-dot.ok { background: #dcfce7 !important; }
          .inter-dot.pending { background: #fef9c3 !important; }
          .inter-badge.valid { background: #dcfce7 !important; }
          .inter-badge.pending { background: #fef9c3 !important; }
          .causes-list .cause-tag { background: #e5e7eb !important; }
          .section-title::before { background: #f97316 !important; }
          .logo-box { background: #f97316 !important; }
          @page { margin: 10mm; size: A4; }
        }
      `}</style>

      <div className="no-print">
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimer / Enregistrer PDF</button>
        <button className="btn-close" onClick={() => window.close()}>✕ Fermer</button>
      </div>

      <div className="page">
        {/* En-tête */}
        <div className="header">
          <div className="logo-block">
            <div className="logo-box">⚙</div>
            <div>
              <div className="app-name">TriMaint</div>
              <div className="app-sub">GMAO Triselec — Rapport technique</div>
            </div>
          </div>
          <div className="report-meta">
            <div className="doc-title">Fiche de panne &amp; réparation</div>
            <div>Réf. panne : <strong>#{panne.id}</strong></div>
            <div>Généré le : {fmtFull(new Date().toISOString())}</div>
          </div>
        </div>

        {/* Bloc panne */}
        <div className="panne-header">
          <div className="panne-title">
            {panne.titre}
            <span className="badge" style={{ backgroundColor: critColor }}>{critLabel}</span>
          </div>
          {panne.description && <div className="panne-desc">{panne.description}</div>}
          <div className="meta-grid">
            <div className="meta-cell">
              <label>Machine</label>
              <span className="accent">{panne.machine_nom || `#${panne.machine_id}`}</span>
            </div>
            <div className="meta-cell">
              <label>Déclarée le</label>
              <span>{fmt(panne.created_at)}</span>
            </div>
            <div className="meta-cell">
              <label>Temps moy. réparation</label>
              <span>{panne.temps_moyen_reparation ? `${panne.temps_moyen_reparation} min` : '—'}</span>
            </div>
            <div className="meta-cell">
              <label>Interventions</label>
              <span>{panne.interventions_liees?.length ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Protocole de réparation */}
        <div className="section">
          <div className="section-title">Protocole de réparation</div>
          {panne.protocole_reparation ? (
            <div className="protocole-box">{panne.protocole_reparation}</div>
          ) : (
            <div className="empty-box">Aucun protocole défini pour cette panne.</div>
          )}
        </div>

        {/* Diagnostic */}
        <div className="section">
          <div className="section-title">Diagnostic</div>
          <div className="diag-grid">
            <div className="diag-cell">
              <label>Cause réelle identifiée</label>
              <p>{panne.cause_reelle || <em style={{ color: '#9ca3af' }}>Non renseigné</em>}</p>
            </div>
            <div className="diag-cell">
              <label>Solution appliquée</label>
              <p>{panne.solution || <em style={{ color: '#9ca3af' }}>Non renseignée</em>}</p>
            </div>
          </div>
          {panne.causes_possibles?.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Causes possibles</div>
              <div className="causes-list">
                {panne.causes_possibles.map((c: string, i: number) => <span key={i} className="cause-tag">{c}</span>)}
              </div>
            </div>
          )}

          {/* Médias de la cause et de la solution */}
          {(panne.cause_medias?.length > 0 || panne.solution_medias?.length > 0) && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Médias (photos / vidéos)</div>
              {panne.cause_medias?.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>Cause :</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px' }}>
                    {panne.cause_medias.map((m: any, i: number) => (
                      m.type === 'image' ? (
                        <img key={i} src={m.url} alt={m.name || `cause-${i}`} style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                      ) : (
                        <div key={i} style={{ width: '100%', height: '90px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#6b7280' }}>
                          🎬 Vidéo<br />{m.name || ''}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              {panne.solution_medias?.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>Solution :</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px' }}>
                    {panne.solution_medias.map((m: any, i: number) => (
                      m.type === 'image' ? (
                        <img key={i} src={m.url} alt={m.name || `solution-${i}`} style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                      ) : (
                        <div key={i} style={{ width: '100%', height: '90px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#6b7280' }}>
                          🎬 Vidéo<br />{m.name || ''}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Interventions réalisées */}
        <div className="section">
          <div className="section-title">
            Interventions réalisées ({panne.interventions_liees?.length ?? 0})
          </div>
          {!panne.interventions_liees?.length ? (
            <div className="empty-box">Aucune intervention enregistrée.</div>
          ) : (
            <div className="interventions-list">
              {panne.interventions_liees.map((inter: any, idx: number) => (
                <div key={inter.id} className="inter-row">
                  <div className={`inter-dot ${inter.validee ? 'ok' : 'pending'}`}>
                    {inter.validee ? '✓' : '○'}
                  </div>
                  <div className="inter-content">
                    <div className="inter-top">
                      <span className="inter-tech">{inter.technicien}</span>
                      <div className="inter-badges">
                        {inter.duree && <span className="inter-duration">{inter.duree} min</span>}
                        <span className={`inter-badge ${inter.validee ? 'valid' : 'pending'}`}>
                          {inter.validee ? `Validée par ${inter.validee_par}` : 'En attente de validation'}
                        </span>
                      </div>
                    </div>
                    {inter.commentaire && <div className="inter-comment">{inter.commentaire}</div>}
                    <div className="inter-date">
                      {fmtFull(inter.date_intervention || inter.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pièces utilisées */}
        {panne.pieces_detail?.length > 0 && (
          <div className="section">
            <div className="section-title">Pièces utilisées ({panne.pieces_detail.length})</div>
            <table className="pieces-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Désignation</th>
                  <th>Référence</th>
                  <th style={{ textAlign: 'center' }}>Qté</th>
                </tr>
              </thead>
              <tbody>
                {panne.pieces_detail.map((p: any, i: number) => (
                  <tr key={p.piece_id}>
                    <td style={{ color: '#9ca3af', width: '30px' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{p.nom}</td>
                    <td className="mono">{p.reference}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>×{p.quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Zone signature */}
        <div className="section" style={{ marginTop: '24px' }}>
          <div className="section-title">Validation &amp; signature</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '6px' }}>
            {['Technicien', 'Responsable maintenance', 'Chef de site'].map(role => (
              <div key={role} style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '30px' }}>{role}</div>
                <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '4px', fontSize: '10px', color: '#9ca3af' }}>Date &amp; signature</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pied de page */}
        <div className="footer">
          <span>TriMaint — GMAO Triselec</span>
          <span>Fiche panne #{panne.id} — {panne.machine_nom}</span>
          <span>Généré le {fmtFull(new Date().toISOString())}</span>
        </div>
      </div>
    </>
  )
}
