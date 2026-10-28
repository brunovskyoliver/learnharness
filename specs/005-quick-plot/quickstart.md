# Quickstart: verify feature 005

1. Unit: `plotKitSpec` for 1- and 2-variable inputs validates with `validateDemoKitSpec`; input problems caught.
2. Tool with faux headless: success returns demo details; page error / zero finite / unavailable → error results.
3. Real headless (Chrome present): `plotKitSpec` of `x**2 + 3*x*y**2` renders without errors and with finite values.
4. View: a plot tool part renders the demo artifact and joins the side panel.
5. Browser: seeded session containing a plot tool result renders the plot; open beside; 320/390/1440.
6. Live (owner-run or hosted after deploy): ask the practice agent "plot f(x,y)=x^2+3y^2x".
7. `npm test && npm run lint && npm run typecheck && npm run build`; smoke tests; perf.
