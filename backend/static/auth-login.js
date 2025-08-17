import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';

const REDIRECT_URI = window.__AUTH_REDIRECT_URI__;
const PRIVY_APP_ID = window.__PRIVY_APP_ID__;

function LoginInner() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (authenticated) {
        try {
          setBusy(true);
          const token = await getAccessToken();
          const url = REDIRECT_URI + '#privyToken=' + encodeURIComponent(token);
          window.location.replace(url);
        } catch (e) {
          console.error('[AuthStart] Failed to get access token', e);
          setBusy(false);
        }
      }
    })();
  }, [ready, authenticated]);

  if (!ready) return React.createElement('div', null, 'Loading…');
  if (busy) return React.createElement('div', null, 'Finalizing…');
  return React.createElement('div', null,
    React.createElement('button', { onClick: () => login({ withEmail: true }) }, 'Sign in with email')
  );
}

function App() {
  return React.createElement(PrivyProvider, {
    appId: PRIVY_APP_ID,
    config: { embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } } }
  }, React.createElement(LoginInner));
}

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));


