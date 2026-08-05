(() => {
  const root = document.querySelector('#fantasy-content');
  if (!root || !window.GTO_LEAGUE) return;

  const SUPABASE_URL = 'https://vgyovudlmcpdimvpesuq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_8-jCWdF9tKS5MrwtAsXloA_kVtXI5nl';
  const DEVICE_KEY = 'gto-fantasy-device-token';
  const number = new Intl.NumberFormat('en-US');
  const views = ['home', 'lineup', 'lineups', 'results', 'standings', 'tiers', 'profiles', 'rules', 'admin'];
  const viewLabels = { home: 'Fantasy Home', lineup: 'Select Lineup', lineups: 'My Lineups', results: 'Weekly Results', standings: 'Season Standings', tiers: 'Driver Tiers', profiles: 'Player Profiles', rules: 'Rules', admin: 'Fantasy Admin' };
  const state = { view: 'home', account: null, rounds: [], currentRound: null, tiers: [], lineup: null, previousLineup: null, selected: {}, standings: [], notice: '', error: '', adminSession: sessionStorage.getItem('gto-fantasy-admin-session') || '', adminPreview: [] };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  const getToken = () => localStorage.getItem(DEVICE_KEY) || '';
  const randomToken = () => {
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const ensureToken = () => { const existing = getToken(); if (existing) return existing; const created = randomToken(); localStorage.setItem(DEVICE_KEY, created); return created; };
  const setMessage = (notice = '', error = '') => { state.notice = notice; state.error = error; };
  const statusLabel = (status) => ({ not_open: 'Not Open', open: 'Open', locked: 'Locked', awaiting_results: 'Awaiting Race Results', scored: 'Scored', canceled: 'Canceled' }[status] || 'Not Open');
  const rpc = async (name, body = {}) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const output = await response.json().catch(() => null);
    if (!response.ok) throw new Error(output?.message || output?.hint || `Fantasy service error (${response.status}).`);
    return output;
  };
  const league = window.GTO_LEAGUE;
  const season = (id) => league.seasons.find((item) => item.id === String(id));
  const roundId = (round) => `${round.season_id}:${round.race_index}`;
  const enteredSeason = season('5');
  const allFantasyRounds = () => (enteredSeason ? league.getScheduleRounds(enteredSeason) : []);
  const currentOrNextRound = () => state.rounds.find((round) => ['open', 'locked', 'awaiting_results'].includes(round.status)) || state.rounds.find((round) => round.status === 'not_open') || null;
  const fmtDate = (value) => value ? dateFormat.format(new Date(value)) + ' ET' : 'Set by administrator';
  const fantasyNav = () => '<div class="fantasy-tabs" role="tablist" aria-label="Fantasy League sections">' + views.map((view) => `<button type="button" data-fantasy-view="${view}" aria-selected="${state.view === view}">${viewLabels[view]}</button>`).join('') + '</div>';
  const message = () => (state.notice ? `<p class="fantasy-notice" role="status">${esc(state.notice)}</p>` : '') + (state.error ? `<p class="fantasy-error" role="alert">${esc(state.error)}</p>` : '');
  const noData = (text) => `<p class="fantasy-empty">${esc(text)}</p>`;
  const tierRows = (tiers = state.tiers) => [1, 2, 3].map((tier) => `<section class="fantasy-tier"><div class="fantasy-tier-heading"><span>Tier ${tier}</span><small>${tiers.filter((row) => Number(row.tier) === tier).length} available drivers</small></div>${tiers.filter((row) => Number(row.tier) === tier).map((row) => `<article class="fantasy-driver-row"><strong>${esc(row.driver_name)}</strong><span>Champ. ${row.championship_position ? `P${row.championship_position}` : '—'}</span><span>${esc(row.prediction_odds || 'Odds unavailable')}</span><b>${Number(row.tier_rating).toFixed(1)}</b></article>`).join('') || '<p>No saved drivers.</p>'}</section>`).join('');
  const currentSeasonRound = () => {
    if (!state.currentRound) return null;
    return allFantasyRounds().find((item) => item.index === Number(state.currentRound.race_index));
  };

  function calculateTierPreview(seasonId, raceIndex) {
    const activeSeason = season(seasonId); const round = league.getScheduleRounds(activeSeason)[raceIndex];
    if (!round) return [];
    let forecasts = [];
    try { forecasts = league.predictionRaceForecast(activeSeason, round); } catch (_) { forecasts = []; }
    const bestPrediction = Math.max(0, ...forecasts.map((item) => item.winProbability || 0));
    const previousSeason = league.seasons[league.seasons.findIndex((item) => item.id === activeSeason.id) - 1];
    const standingSeason = Number(raceIndex) < 3 && previousSeason ? previousSeason : activeSeason;
    let standingRows = [];
    try { standingRows = league.calculateStandings(standingSeason, { applyChampionshipPointDrops: ['3', '4'].includes(standingSeason.id), applyChampionshipBonusPoints: true }); } catch (_) { standingRows = []; }
    standingRows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    const standingRank = new Map(standingRows.map((row, index) => [row.name, index + 1]));
    const field = forecasts.length ? forecasts : (activeSeason.predictionDrivers || []).filter((name) => !['Trevor Levine', 'Nick Collier', 'YattMan'].includes(name)).map((name) => ({ name, winProbability: 0, rating: 0 }));
    const count = field.length;
    const data = field.map((row) => {
      const position = standingRank.get(row.name) || null;
      const predictionStrength = bestPrediction > 0 ? ((row.winProbability || 0) / bestPrediction) * 100 : Number(row.rating || 50);
      const baseStanding = position ? (count <= 1 ? 100 : ((standingRows.length - position) / Math.max(1, standingRows.length - 1)) * 100) : predictionStrength;
      const tierRating = baseStanding * .5 + predictionStrength * .5;
      const probability = row.winProbability || 0;
      const odds = probability > .5 ? `-${Math.round((probability / Math.max(.001, 1 - probability)) * 100)}` : `+${Math.round(((1 - probability) / Math.max(.001, probability)) * 100)}`;
      return { driver_name: row.name, championship_position: position, standings_strength: baseStanding, prediction_odds: probability ? odds : '—', prediction_strength: predictionStrength, tier_rating: tierRating, entered: true, source: { standings_source: standingSeason.name, race_prediction_win_probability: probability } };
    }).sort((a, b) => b.tier_rating - a.tier_rating || a.driver_name.localeCompare(b.driver_name));
    const base = Math.floor(data.length / 3); const extra = data.length % 3;
    const sizes = [base, base + (extra > 1 ? 1 : 0), base + (extra > 0 ? 1 : 0)];
    return data.map((row, index) => ({ ...row, tier: index < sizes[0] ? 1 : index < sizes[0] + sizes[1] ? 2 : 3 }));
  }

  async function refreshAccount() {
    const token = getToken(); if (!token) return null;
    state.account = await rpc('fantasy_get_account', { device_token: token });
    return state.account;
  }
  async function refreshRoundData() {
    state.rounds = await rpc('fantasy_public_rounds');
    state.currentRound = currentOrNextRound();
    state.tiers = state.currentRound ? await rpc('fantasy_public_tiers', { round_uuid: state.currentRound.id }) : [];
    if (state.account && state.currentRound) {
      state.lineup = await rpc('fantasy_my_lineup', { device_token: getToken(), round_uuid: state.currentRound.id });
      const previous = state.rounds.find((round) => round.season_id === state.currentRound.season_id && Number(round.race_index) === Number(state.currentRound.race_index) - 1);
      state.previousLineup = previous ? await rpc('fantasy_my_lineup', { device_token: getToken(), round_uuid: previous.id }) : null;
    }
  }
  async function refresh() {
    try { await refreshAccount(); await refreshRoundData(); state.standings = await rpc('fantasy_public_standings', { season: '5' }); setMessage(); }
    catch (error) { setMessage('', error.message); }
    render();
  }

  function renderHome() {
    const current = state.currentRound; const race = currentSeasonRound(); const submitted = Boolean(state.lineup?.id);
    return `<div class="fantasy-home-grid"><section class="fantasy-hero-card"><p class="eyebrow">${current ? `Season ${esc(current.season_id)} · Round ${Number(current.race_index) + 1}` : 'Season 5 Fantasy'}</p><h3>${current ? esc(current.race_name) : 'Fantasy League is awaiting its first round'}</h3><p>${race?.race?.label ? esc(race.race.label) : 'The administrator will publish the official race, tiers, and deadline before lineups open.'}</p><div class="fantasy-status"><strong>${current ? statusLabel(current.status) : 'Not Open'}</strong><span>${current ? `Locks ${fmtDate(current.locks_at)}` : 'No Fantasy League round has been opened.'}</span></div></section><section class="fantasy-account-card"><p class="eyebrow">Your Fantasy Profile</p>${state.account ? `<h3>${esc(state.account.display_name)}</h3><p>${submitted ? 'Lineup saved for this round.' : 'No lineup submitted for this round.'}</p><button class="button button-primary" type="button" data-fantasy-view="lineup">${submitted ? 'Review lineup' : 'Build lineup'}</button>` : `<h3>Join the grid</h3><p>Create a display name on this device to submit Tier 1, Tier 2, and Tier 3 drivers.</p><button class="button button-primary" type="button" data-fantasy-action="show-register">Create profile</button><button class="fantasy-text-button" type="button" data-fantasy-action="show-recovery">Restore a profile</button>`}</section></div><section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Saved weekly tiers</p><h3>${current ? 'Driver Tier Snapshot' : 'What happens next'}</h3></div><p>${current ? `Standings source: ${esc(current.standings_source.replace('_', ' '))}. Tier assignments remain fixed once submissions open.` : 'Tiers blend championship standing strength and the official race prediction model 50/50.'}</p></div>${state.tiers.length ? tierRows() : noData('No tiers are published yet. The Fantasy Admin will generate them from the official Season 5 entry list before the round opens.')}</section>`;
  }
  function renderRegister() { return `<section class="fantasy-panel fantasy-form-panel"><div class="panel-title"><div><p class="eyebrow">Device profile</p><h3>Choose your Fantasy League name</h3></div><p>This profile is tied to this browser and device. Save the private recovery code shown after registration.</p></div><form data-fantasy-form="register"><label>Display name<input name="display_name" maxlength="24" required pattern="[A-Za-z0-9 _-]{2,24}" autocomplete="nickname" /></label><button class="button button-primary" type="submit">Create profile</button><button class="fantasy-text-button" type="button" data-fantasy-view="home">Cancel</button></form><p class="fantasy-security-note">Clearing browser data, private browsing, a new browser, or a different device can disconnect this profile. Your recovery code is never shown publicly.</p></section>`; }
  function renderRecovery() { return `<section class="fantasy-panel fantasy-form-panel"><div class="panel-title"><div><p class="eyebrow">Account recovery</p><h3>Restore your profile</h3></div><p>Enter the recovery code you saved when your profile was created.</p></div><form data-fantasy-form="recover"><label>Recovery code<input name="recovery_code" required autocomplete="one-time-code" /></label><button class="button button-primary" type="submit">Restore profile</button><button class="fantasy-text-button" type="button" data-fantasy-view="home">Cancel</button></form></section>`; }
  function previousDrivers() { return new Set((state.previousLineup?.drivers || []).map((item) => item.driver_name)); }
  function renderLineup() {
    const current = state.currentRound; const unavailable = previousDrivers(); const selected = state.selected; const saved = new Map((state.lineup?.drivers || []).map((item) => [Number(item.tier), item.driver_name]));
    if (!state.account) return renderRegister();
    if (!current) return `<section class="fantasy-panel">${noData('Lineups will appear once the Fantasy Admin publishes a Season 5 round and its tier snapshot.')}</section>`;
    const selections = [1, 2, 3].map((tier) => selected[tier] || saved.get(tier) || '—');
    const editable = current.status === 'open' && new Date(current.opens_at) <= new Date() && new Date(current.locks_at) > new Date();
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">${esc(statusLabel(current.status))}</p><h3>Season ${esc(current.season_id)} · Round ${Number(current.race_index) + 1}</h3></div><p>Deadline: ${fmtDate(current.locks_at)}. One driver is required from each tier.</p></div><div class="fantasy-sticky-lineup"><span>Tier 1: <b>${esc(selections[0])}</b></span><span>Tier 2: <b>${esc(selections[1])}</b></span><span>Tier 3: <b>${esc(selections[2])}</b></span></div>${[1,2,3].map((tier) => `<section class="fantasy-tier fantasy-select-tier"><div class="fantasy-tier-heading"><span>Tier ${tier}</span><small>${tier === 1 ? 'Top-rated race choices' : tier === 2 ? 'Mid-tier race choices' : 'Value race choices'}</small></div>${state.tiers.filter((row) => Number(row.tier) === tier).map((row) => { const disabled = unavailable.has(row.driver_name); const isSelected = (selected[tier] || saved.get(tier)) === row.driver_name; return `<label class="fantasy-driver-choice ${disabled ? 'is-unavailable' : ''} ${isSelected ? 'is-selected' : ''}"><input type="radio" name="fantasy-tier-${tier}" value="${esc(row.driver_name)}" data-fantasy-tier="${tier}" ${isSelected ? 'checked' : ''} ${disabled || !editable ? 'disabled' : ''}/><span><strong>${esc(row.driver_name)}</strong><small>${disabled ? 'Unavailable — selected in your previous lineup' : `Champ. ${row.championship_position ? `P${row.championship_position}` : '—'} · ${esc(row.prediction_odds || '—')}`}</small></span><b>${Number(row.tier_rating).toFixed(1)}</b></label>`; }).join('') || noData('No drivers are saved in this tier.')}</section>`).join('')}${editable ? `<button class="button button-primary" type="button" data-fantasy-action="save-lineup">${state.lineup ? 'Update lineup' : 'Submit lineup'}</button>` : `<p class="fantasy-security-note">This lineup is read-only because the round is ${esc(statusLabel(current.status).toLowerCase())}.</p>`}</section>`;
  }
  function renderMyLineups() { const current = state.currentRound; return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Lineup history</p><h3>My Lineups</h3></div><p>Submitted lineups retain their saved tier snapshot, original time, last update, and scoring status.</p></div>${state.account && current && state.lineup ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Season</th><th>Round</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>Submitted</th><th>Status</th></tr></thead><tbody><tr><td>${esc(current.season_id)}</td><td>R${Number(current.race_index)+1}</td>${[1,2,3].map((tier) => `<td>${esc((state.lineup.drivers || []).find((item) => Number(item.tier) === tier)?.driver_name || '—')}</td>`).join('')}<td>${fmtDate(state.lineup.original_submitted_at)}</td><td>${esc(statusLabel(current.status))}</td></tr></tbody></table></div>` : noData(state.account ? 'No submitted lineup is available for the current Fantasy League round.' : 'Create a Fantasy League profile to save and view lineups.')}</section>`; }
  function renderStandings() { const rows = state.standings || []; return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Season 5</p><h3>Fantasy Season Standings</h3></div><p>Ranked by counting fantasy championship points after each player’s three lowest scored rounds are dropped.</p></div>${rows.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Rank</th><th>Player</th><th>Counting Pts</th><th>Raw Pts</th><th>Weekly Wins</th><th>Rounds Entered</th><th>Avg. Raw</th><th>Best Week</th></tr></thead><tbody>${rows.map((row,index) => `<tr><td>${index+1}</td><td><strong>${esc(row.display_name)}</strong></td><td>${number.format(row.counting_points || 0)}</td><td>${number.format(row.raw_points || 0)}</td><td>${number.format(row.weekly_wins || 0)}</td><td>${number.format(row.rounds_entered || 0)}</td><td>${row.average_raw_score ?? '—'}</td><td>${row.best_weekly_score ?? '—'}</td></tr>`).join('')}</tbody></table></div>` : noData('Season standings will appear after the first official Fantasy League round is scored.')}</section>`; }
  function renderTiers() { const current = state.currentRound; return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Weekly snapshot</p><h3>Driver Tiers</h3></div><p>${current ? `Round ${Number(current.race_index)+1} uses ${esc(current.standings_source.replace('_',' '))} standings. Rankings are saved before entries open.` : 'Tiers are generated only for officially entered drivers.'}</p></div>${state.tiers.length ? `<div class="table-shell"><table class="profile-table fantasy-table"><thead><tr><th>Tier</th><th>Driver</th><th>Champ. Pos.</th><th>Standings Score</th><th>Prediction Odds</th><th>Prediction Score</th><th>Tier Rating</th></tr></thead><tbody>${state.tiers.map((row) => `<tr><td>Tier ${row.tier}</td><td><strong>${esc(row.driver_name)}</strong></td><td>${row.championship_position ? `P${row.championship_position}` : '—'}</td><td>${Number(row.standings_strength).toFixed(1)}</td><td>${esc(row.prediction_odds || '—')}</td><td>${Number(row.prediction_strength).toFixed(1)}</td><td><b>${Number(row.tier_rating).toFixed(1)}</b></td></tr>`).join('')}</tbody></table></div>` : noData('No tier snapshot has been published yet.')}</section>`; }
  function renderResults() { return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Official scoring</p><h3>Weekly Results</h3></div><p>Fantasy scoring appears only after the official GTO result is finalized. No live or provisional scores are displayed.</p></div>${noData('No Fantasy League week has been finalized yet.')}</section>`; }
  function renderProfiles() { return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Fantasy drivers</p><h3>Player Profiles</h3></div><p>Profiles show season rank, selection history, tier accuracy, drops, and weekly performance after scored rounds exist.</p></div>${state.standings.length ? `<div class="fantasy-profile-grid">${state.standings.map((row,index) => `<article><span>Rank ${index+1}</span><h4>${esc(row.display_name)}</h4><strong>${number.format(row.counting_points || 0)} pts</strong><small>${number.format(row.rounds_entered || 0)} rounds entered · ${number.format(row.weekly_wins || 0)} weekly wins</small></article>`).join('')}</div>` : noData('Profiles will become available after a player registers and a round is scored.')}</section>`; }
  function renderRules() { return `<section class="fantasy-panel fantasy-rules"><div class="panel-title"><div><p class="eyebrow">How it works</p><h3>Fantasy League Rules</h3></div><p>These rules are enforced by both the website and the secure Fantasy League backend.</p></div><ol><li><strong>Pick three drivers:</strong> exactly one each from Tier 1, Tier 2, and Tier 3. Ownership is unlimited across different players.</li><li><strong>No immediate repeat:</strong> a driver used in your previous submitted fantasy round cannot be selected in the next round. A missed week clears that restriction.</li><li><strong>Weekly tiers:</strong> entered drivers are ranked 50% by the applicable championship standings and 50% by event-specific prediction strength. Rounds 1–3 use the prior season’s final standings; Round 4 onward uses current-season standings.</li><li><strong>Schedule:</strong> submissions open Monday at 8:00 AM Eastern after the prior official result is finalized and lock Sunday at 8:00 PM Eastern.</li><li><strong>Scoring:</strong> finish points are 25–20–16–13–11–10 through 15th, plus bonuses for wins, podiums, pole, fastest lap, laps led, most laps led, and positions gained.</li><li><strong>Championship:</strong> weekly lineup scores determine fantasy championship points using the same 25–20–16 scale. Three lowest scored weeks are dropped; No Entry is not a zero and does not consume a drop.</li><li><strong>Profiles:</strong> profiles are tied to this browser/device. Save your private recovery code; clearing browser data or changing devices can otherwise prevent recovery.</li></ol></section>`; }
  function adminRoundOptions() { return allFantasyRounds().map((item) => `<option value="${item.index}">Season 5 · Round ${item.index+1} — ${esc(item.race.name)}</option>`).join(''); }
  function renderAdmin() {
    if (!state.adminSession) return `<section class="fantasy-panel fantasy-form-panel"><div class="panel-title"><div><p class="eyebrow">Protected controls</p><h3>Fantasy Admin</h3></div><p>Administrator changes are saved to the audit log. The admin code never appears publicly.</p></div><form data-fantasy-form="admin-login"><label>Administrator code<input name="admin_code" type="password" required autocomplete="current-password" /></label><button class="button button-primary" type="submit">Unlock admin</button></form></section>`;
    return `<section class="fantasy-panel"><div class="panel-title"><div><p class="eyebrow">Protected controls</p><h3>Fantasy Admin Dashboard</h3></div><p>${state.currentRound ? `${esc(state.currentRound.race_name)} · ${esc(statusLabel(state.currentRound.status))}` : 'No active round.'}</p></div><div class="fantasy-admin-grid"><section><h4>Manage Round</h4><label>Choose round<select data-fantasy-admin-round>${adminRoundOptions()}</select></label><label>Open time (Eastern)<input type="datetime-local" data-fantasy-open-time required /></label><label>Lock time (Eastern)<input type="datetime-local" data-fantasy-lock-time required /></label><button type="button" class="button button-primary" data-fantasy-action="generate-tiers">Generate tier preview</button><button type="button" class="button" data-fantasy-action="publish-round">Save tiers & open round</button><p class="fantasy-security-note">The next round cannot open until the previous Fantasy League round is marked scored.</p></section><section><h4>Driver Tiers</h4><p>Weights: standings 50% · prediction 50%. Extra drivers are assigned to the lower tiers first.</p>${state.adminPreview.length ? tierRows(state.adminPreview) : '<p>Generate a preview to inspect all source values before publishing.</p>'}</section></div><section class="fantasy-admin-summary"><h4>Admin tools included</h4><p>Round management, saved tier snapshots, locked lineup validation, audit entries, secure player devices, recovery codes, public standings, and scoring storage are active in the backend. Scoring controls activate when an official result is added.</p></section></section>`;
  }
  function renderRecoveryCode(code) { return `<section class="fantasy-panel fantasy-recovery-card"><p class="eyebrow">Save this now</p><h3>Your recovery code</h3><code>${esc(code)}</code><p>Store this privately. It is the only way to reconnect this Fantasy League profile on another device. It will not be shown again.</p><button class="button button-primary" type="button" data-fantasy-view="home">I saved it</button></section>`; }
  function render() {
    const body = state.view === 'register' ? renderRegister() : state.view === 'recovery' ? renderRecovery() : state.view === 'recovery-code' ? renderRecoveryCode(state.recoveryCode) : state.view === 'lineup' ? renderLineup() : state.view === 'lineups' ? renderMyLineups() : state.view === 'results' ? renderResults() : state.view === 'standings' ? renderStandings() : state.view === 'tiers' ? renderTiers() : state.view === 'profiles' ? renderProfiles() : state.view === 'rules' ? renderRules() : state.view === 'admin' ? renderAdmin() : renderHome();
    root.innerHTML = fantasyNav() + message() + body;
  }
  async function register(form) { const name = form.display_name.value.trim(); const recoveryCode = `GTO-${randomToken().slice(0, 20).toUpperCase()}`; await rpc('fantasy_register_player', { display_name: name, device_token: ensureToken(), recovery_code: recoveryCode }); state.recoveryCode = recoveryCode; await refreshAccount(); state.view = 'recovery-code'; setMessage('Fantasy profile created. Save the recovery code before continuing.'); render(); }
  async function recover(form) { await rpc('fantasy_recover_account', { recovery_code: form.recovery_code.value.trim(), device_token: ensureToken() }); await refresh(); state.view = 'home'; setMessage('Your Fantasy League profile was restored.'); render(); }
  async function saveLineup() { const drivers = [1,2,3].map((tier) => state.selected[tier] || (state.lineup?.drivers || []).find((item) => Number(item.tier) === tier)?.driver_name).map((driver_name, index) => ({ tier: index + 1, driver_name })); if (drivers.some((item) => !item.driver_name)) throw new Error('Choose one driver from each tier before submitting.'); state.lineup = await rpc('fantasy_save_lineup', { device_token: getToken(), round_uuid: state.currentRound.id, selections: drivers }); state.selected = {}; setMessage('Your lineup is saved. You can update it until the Sunday deadline.'); render(); }
  async function adminLogin(form) { const token = randomToken(); await rpc('fantasy_admin_login', { admin_code: form.admin_code.value, session_token: token }); state.adminSession = token; sessionStorage.setItem('gto-fantasy-admin-session', token); setMessage('Fantasy Admin access unlocked for this browser session.'); render(); }
  function selectedAdminRound() { const index = Number(root.querySelector('[data-fantasy-admin-round]')?.value || 0); return { season: enteredSeason, index, round: allFantasyRounds()[index] }; }
  async function generateTiers() { const selectedRound = selectedAdminRound(); state.adminPreview = calculateTierPreview('5', selectedRound.index); if (!state.adminPreview.length) throw new Error('The prediction model could not produce an eligible Season 5 field for this round.'); setMessage('Tier preview generated from the official entry list, standings source, and race prediction model.'); render(); }
  async function publishRound() {
    const selectedRound = selectedAdminRound(); const openInput = root.querySelector('[data-fantasy-open-time]')?.value; const lockInput = root.querySelector('[data-fantasy-lock-time]')?.value;
    if (!openInput || !lockInput) throw new Error('Set both the Eastern opening and locking times before publishing the round.');
    if (!state.adminPreview.length) await generateTiers();
    const previous = state.rounds.find((round) => round.season_id === '5' && Number(round.race_index) === selectedRound.index - 1);
    if (previous && previous.status !== 'scored') throw new Error('The previous Fantasy League round must be scored before the next round opens.');
    const payload = { season_id: '5', race_index: selectedRound.index, race_name: selectedRound.round.race.name, race_label: selectedRound.round.race.label || '', status: 'not_open', opens_at: new Date(openInput).toISOString(), locks_at: new Date(lockInput).toISOString(), standings_source: selectedRound.index < 3 ? 'previous_season' : 'current_season' };
    const created = await rpc('fantasy_admin_save_round', { session_token: state.adminSession, payload });
    await rpc('fantasy_admin_save_tiers', { session_token: state.adminSession, round_uuid: created.id, tiers: state.adminPreview });
    const opened = await rpc('fantasy_admin_save_round', { session_token: state.adminSession, payload: { ...payload, status: 'open' } });
    state.currentRound = opened; await refreshRoundData(); setMessage('The tier snapshot is saved and submissions are now open.'); state.view = 'home'; render();
  }
  root.addEventListener('click', async (event) => {
    const view = event.target.closest('[data-fantasy-view]'); const action = event.target.closest('[data-fantasy-action]');
    if (view) { state.view = view.dataset.fantasyView; setMessage(); render(); return; }
    try {
      if (!action) return;
      if (action.dataset.fantasyAction === 'show-register') { state.view = 'register'; render(); }
      if (action.dataset.fantasyAction === 'show-recovery') { state.view = 'recovery'; render(); }
      if (action.dataset.fantasyAction === 'save-lineup') await saveLineup();
      if (action.dataset.fantasyAction === 'generate-tiers') await generateTiers();
      if (action.dataset.fantasyAction === 'publish-round') await publishRound();
    } catch (error) { setMessage('', error.message); render(); }
  });
  root.addEventListener('change', (event) => { if (event.target.matches('[data-fantasy-tier]')) { state.selected[Number(event.target.dataset.fantasyTier)] = event.target.value; render(); } });
  root.addEventListener('submit', async (event) => { event.preventDefault(); try { const form = event.target; if (form.dataset.fantasyForm === 'register') await register(form); if (form.dataset.fantasyForm === 'recover') await recover(form); if (form.dataset.fantasyForm === 'admin-login') await adminLogin(form); } catch (error) { setMessage('', error.message); render(); } });
  refresh();
})();
