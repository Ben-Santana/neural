import {useEffect, useState} from 'react';
import type {AppSettings as Settings} from './types';

export function AppSettings() {
  const [settings, setSettings] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    window.band?.getSettings?.().then(setSettings).catch(() => setError('Could not load app settings.'));
  }, []);
  async function update(change: Partial<Settings>) {
    if (!window.band?.updateSettings) return;
    setBusy(true);
    setError('');
    try { setSettings(await window.band.updateSettings(change)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save app settings.'); }
    finally { setBusy(false); }
  }
  return <>
    <section><h2>App behavior</h2><p>Keep Neural available while you use other apps. Open or quit Neural from its menu bar icon.</p></section>
    <section className="panel settings-panel app-behavior">
      <div className="setting-row"><div><span id="background-label">Run in the background</span><p id="background-help">Keep the band connection and shortcuts active when you close the window.</p></div><button className="motion-toggle" role="switch" aria-labelledby="background-label" aria-describedby="background-help" aria-checked={settings?.runInBackground ?? false} disabled={!settings || busy} onClick={() => update({runInBackground: !settings?.runInBackground})}><span/></button></div>
      <div className="setting-row"><div><span id="login-label">Open at login</span><p id="login-help">Start Neural in the background when you sign in to your Mac.</p></div><button className="motion-toggle" role="switch" aria-labelledby="login-label" aria-describedby="login-help" aria-checked={settings?.openAtLogin ?? false} disabled={!settings?.loginAvailable || busy} onClick={() => update({openAtLogin: !settings?.openAtLogin})}><span/></button></div>
      {!settings?.loginAvailable && <p className="app-settings-note">Open the installed macOS app to configure launch at login.</p>}
      {settings?.loginStatus === 'requires-approval' && <p className="app-settings-note">Allow Neural in System Settings → General → Login Items to finish enabling launch at login.</p>}
      {error && <p className="app-settings-note" role="alert">{error}</p>}
    </section>
  </>;
}
