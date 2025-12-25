# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Optional: Use Alchemy RPC for read-only calls
This app uses MetaMask (`window.ethereum`) by default. You can optionally use an Alchemy RPC for **read-only** calls (loading elections/candidates), while still using MetaMask to **sign transactions**.

Create a file `.env.local` (do not commit) with:

`VITE_ALCHEMY_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>`

Then restart `npm run dev`.

## Run the app (for anyone cloning this repo)
You do **NOT** need any Alchemy keys or private keys just to run the UI.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173` and connect with the MetaMask extension on **Sepolia**.

## Deploy the contract (optional)
Deploy is only needed if you want your own contract address.

Create a `.env` file in the project root (do not commit) with:

`SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>`
`DEPLOYER_PRIVATE_KEY=0x<YOUR_PRIVATE_KEY>`

Then:

```powershell
npm run compile
npm run deploy:sepolia
```