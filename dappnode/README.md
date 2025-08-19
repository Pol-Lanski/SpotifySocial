## JamSession DAppNode package

This directory contains the DAppNode package definition for deploying the JamSession backend (Node.js API + Postgres) on a DAppNode.

### Files

- `dappnode_package.json`: Package metadata
- `docker-compose.yml`: Services definition for DAppNode (server + Postgres). Exposes the API through Traefik at `https://jamsession.dappnode`.
- `setup-wizard.yml`: Installation wizard questions to collect secrets and DB credentials

### Build and publish

1. Install the SDK: `npm i -g @dappnode/dappnodesdk`
2. From the repo root, run: `dappnodesdk build --path dappnode` to generate the package
3. Test‑install the generated IPFS hash on a DAppNode
4. After install, use the DAppNode UI → Package → Network to:
   - Map an HTTPS domain to container port `5050` (API). See: [Package Network UI](https://docs.dappnode.io/docs/user/packages/understanding-dappnode-packages/network)
   - Optionally add basic auth
5. Publish when ready: `dappnodesdk publish`

See docs: [Dev DNS & service access](https://docs.dappnode.io/docs/dev/dns), [Package Network UI](https://docs.dappnode.io/docs/user/packages/understanding-dappnode-packages/network)

